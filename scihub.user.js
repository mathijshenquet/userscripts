// ==UserScript==
// @name        DOI to Sci-hub
// @description Replaces DOI links with sci-hub links
// @version     2.0
// @author      mthq
// @namespace   mthq Scripts
// @match         *://*/*
// @exclude-match *://*.doi.org/*
// @exclude-match *://doi.org/*
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_xmlhttpRequest
// @run-at        document-start
// ==/UserScript==


let doiUrlBase = "https://doi.org";
const scihubServers = ["sci-hub.ren", "sci-hub.shop", "sci-hub.mksa.top", "sci-hub.se", "sci-hub.st", "sci-hub.do"].reverse();

class Extractor{
    rx;
    pos = 1;
    constructor(rx, pos=1){
        this.rx = rx; 
        this.pos = pos;
    }

    extract(target){
        return this.rx.exec(target)?.[this.pos];
    }

    strip(target){
        return this.extract(target) ?? target;
    }
}

let doiExtractor = new Extractor(/^https?:\/\/(?:dx\.)?doi\.org\/(.*)$/);

const Scihub = {
    init(){
        let primary = null;
        let secondary = null;
        let mirrorStatus = [];
        GM_getValue("servers", scihubServers).forEach((server) => {
            let serverKey = `server:${server}`;
            let {time, alive} = GM_getValue(serverKey, {time: 0, alive: true});
            let isStale = (Date.now() - time) > (1 * 60 * 60 * 1000); // 1 hour

            if (!isStale && alive){
                primary = server;
            }

            if(isStale){
                if(alive)
                    secondary = server;

                let flag = (res) => {
                    let alive = res && res.status >= 200 && res.status < 300;
                    console.log("[Sci-hub] status check", serverKey, alive, res);
                    GM_setValue(serverKey, {time: Date.now(), alive});
                }

                GM_xmlhttpRequest({
                    url: `https://${server}/`,
                    method: "HEAD",
                    onload: flag,
                    onerror: flag
                })
            }
            
            mirrorStatus.push({server, alive, isStale});
        });

        
        this.base = primary ?? secondary ?? doiUrlBase;

        console.log(`[Sci-hub.user.js] Initialized, using ${this.base}`, mirrorStatus)
    },

    urlFromDoi(doi){
        if(!this.base){
            this.init();
        }

        return `https://${this.base}/${doi}`;
    }
}

function patchLink(link){
    if(!link.href || link.href === link.dataset.patchHref){
        return null;
    }
  
    let doi = doiExtractor.extract(link.href);
    if(!doi){
        return null;
    }
  
    let patchHref = Scihub.urlFromDoi(doi);
  
    link.href = patchHref;
    link.dataset.doiHref = `${doiUrlBase}/${doi}`;
    link.dataset.doi = doi;
    link.dataset.patchHref = patchHref;

    return link;
}

function applyAll(fns, ...args){
    fns.forEach((fn) => fn(...args))
}

/* task = {query, attributes=[]}, fn */
const queryObserver = {
    tasks: [],

    attrMap: {},

    add(query, attrs, fn){
        let rootTask = (root, ...args) => {
            root.querySelectorAll(query).forEach((target) => {
                fn(target, ...args);
            });
        };
      
        let attrTask = (target, ...args) => {
            if(target.matches(query)){
                fn(target, ...args);
            }
        };
      
        attrs.forEach((attr) => {
            this.attrMap[attr] ??= [];
            this.attrMap[attr].push(attrTask);
        });

        this.tasks.push(rootTask);
    },

    process(record){
        switch(record.type){
            case "childList": /* node added or removed */
                record.addedNodes.forEach((target) => {
                    if(!(target instanceof Element)) return;

                    applyAll(this.tasks, target, record);
                })

            case "attributes": /* attributes changed */
                let {target, attributeName} = record;

                if(!(target instanceof Element)) return;

                let tasks = this.attrMap[attributeName] ?? [];
                applyAll(tasks, target, record);
        }
    },

    start(){
        let observer = new MutationObserver((mutationList) => {
            mutationList.forEach((record) => this.process(record));
        });
      
        let opts = {
            subtree: true, 
            childList: true, 
            attributeFilter: Object.keys(this.attrMap),
            attributeOldValue: true
        }
      
        console.log('[Sci-hub.user.js] starting MutationObserver with', document, opts);
        observer.observe(document, opts)
      
        applyAll(this.tasks, document);
    }
}

queryObserver.add("a", ['href'], (link, record) => {
    let url = link.href;
    link = patchLink(link);
    if(link){
        console.log("[Sci-hub] Replaced link", link, record)
    }
})

let isSimple = (link) => link.childNodes.length == 1 && link.firstChild.nodeType === Node.TEXT_NODE;

const hostnameExtractor = new Extractor(/(?:www\.)?(.*)/);
let hostname = hostnameExtractor.strip(location.hostname);

// Springer website fix
if(hostname == "link.springer.com"){
    queryObserver.add("#doi-url", [], (span) => {
        if(!isSimple(span)){
            return;
        }
        
        let link = document.createElement("a");
        link.href = span.innerText.trim();
      
        link = patchLink(link);
        if(link){
            link.innerText = link.dataset.doi;
            span.replaceChildren(link);
            console.log("[Sci-hub.user.js] Replaced span#doi-url", span)
        }
    })
  
    queryObserver.add(".main-body > #AboutThisContent", [], (target) => {
        let parent = target.parentElement;
        let header = parent?.querySelector(".Abstract");
      
        if(!header)
            return;
        
        header.insertAdjacentElement("afterend", target);
    })
}

// ScienceDirect (Elsevier) download fix
if(hostname == "sciencedirect.com"){
    queryObserver.add("a[href*=pdf]", ["href"], (link) => {
        let url = new URL(link.href);

        if(url.hostname !== location.hostname || url.searchParams.has("download")){
            return;
        }
        url.searchParams.set("download", "true");

        link.href = url;

        if(link){
            console.log("[Sci-hub] appended download=true", link)
        }
    })
}

queryObserver.start();