// ==UserScript==
// @name        HNq
// @match       https://news.ycombinator.com/*
// @version     0.1
// @author      mthq
// @grant       GM_getResourceText 
// @grant       GM_addStyle
// @resource    style ./hn.user.css
// @downloadURL https://raw.githubusercontent.com/mathijshenquet/userscripts/master/hn.user.js
// @run-at      document-start
// ==/UserScript==

function log(...args) {
  console.log("HNq", ...args);
}

GM_addStyle(GM_getResourceText("style"));

/*
interface Task {
	query: string, // The querySelector string
  flag: string, // the dataset flag to check
  // return values:
  // truethy -> task done, unschedule
  // falsy   -> task not done, schedule later
	run(...args: Array<any>) : true | false;
*/

/* toggle code */

function fold(target, dry) {
  let cursor = target.nextElementSibling;
  let level = target.dataset.level;
  while (cursor && cursor.dataset.level > level) {
    if (!dry) cursor.classList.add("noshow");
    cursor = cursor.nextElementSibling;
  }
  return cursor;
}

function unfold(target) {
  let cursor = target.nextElementSibling;
  let level = target.dataset.level;
  while (cursor && cursor.dataset.level > level) {
    cursor.classList.remove("noshow");
    if (cursor.classList.contains("coll")) {
      cursor = fold(cursor, true);
    } else {
      cursor = cursor.nextElementSibling;
    }
  }
}

function setToggle(toggle, collapsed) {
  toggle.innerText = collapsed ? `[${toggle.getAttribute("n")} more]` : "[-]";
}

/* end toggle */

function colCount(tr) {
  let count = 0;
  for (let i = 0; i < tr.cells.length; i++) {
    count += tr.cells[i].colSpan;
  }
  return count;
}

const loadMore = {
  query: ".morespace",
  flag: "dyn-more",

  run(moreSpace) {
    let tbody = moreSpace.parentElement;

    let oldTr = moreSpace.nextSibling;
    let link = oldTr.querySelector("a.morelink");
    let url = link.href;

    let td = document.createElement("td");
    td.classList.add("more");
    td.colSpan = colCount(oldTr);

    let tr = document.createElement("tr");
    tr.classList.add("more");
    tr.appendChild(td);

    td.appendChild(link);
    tbody.replaceChild(tr, oldTr);

    async function load() {
      link.innerText = "Loading more...";

      let res = await fetch(url);
      let tpl = document.createElement("template");
      tpl.innerHTML = await res.text();
      let content = tpl.content;

      let newTable = tpl.content.querySelector(
        "table.comment-tree, table.itemlist"
      );
      tbody.insertAdjacentElement("afterend", newTable.tBodies[0]);

      if (newTable.classList.contains("comment-tree")) {
        moreSpace.remove();
      } else {
        moreSpace.style.height = "6px";
      }
      tr.remove();

      tpl = null;
    }

    let didTrigger = false;
    function doLoad() {
      if (didTrigger) return;

      iobs.unobserve(moreSpace);
      didTrigger = true;
      load();
    }

    link.addEventListener("click", (ev) => {
      doLoad();
      ev.preventDefault();
      return false;
    });

    let iobs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        doLoad();
      }
    }, {});
    iobs.observe(moreSpace);
  },
};

class Comment{
  constructor(row, cell, $toggle){
    this.row = row;
    this.cell = cell;
    this.id = +row.getAttribute("id");
    this.collapsed = row.classList.contains("coll");
    this.$toggle = $toggle;
    this.parents = null;
    this.hidden = false;
    this.inds = [];

    setToggle($toggle, this.collapsed);

    $toggle.removeAttribute("onclick");
    $toggle.addEventListener("click", (ev) => this.toggle(ev));
  }

  hide(){   
    this.hidden = true; 
    this.row.classList.add("noshow");   
  }

  makeInd(){    
    let ind = document.createElement("div");
    ind.className = "ind";   
    ind.dataset.id = this.id;
     
    ind.addEventListener("mouseenter", () => this.hover(true)); 
    ind.addEventListener("mouseleave", () => this.hover(false));
    ind.addEventListener("click", (ev) => this.toggle(ev));

    this.inds.push(ind);        
    return ind; 
  }

  hover(state){ 
    this.container.classList.toggle("hover", state); 
    this.inds.forEach((ind) => ind.classList.toggle("hover", state))
  }

  make(cells, parents){
    this.parents = parents;

    let container = document.createElement("div");
    container.className = "comment-container";

    // make the indent 
    parents.forEach((item) => {
      let indItem = item.makeInd();
      container.appendChild(indItem);
    })

    // add votelink

    // add the other items
    for(let i = 1; i < cells.length; i++){
      let cell = cells[i];

      let item = document.createElement("div");
      item.className = cell.className;

      let child;
      while((child = cell.firstElementChild)){
        child.removeAttribute("style");
        if(child instanceof HTMLBRElement) 
          child.remove();
        else
          item.appendChild(child);
      }
  
      if(i == 1)
        item.append(this.makeInd());  
      
      container.appendChild(item);
    }
    
    this.container = container;
    this.cell.lastElementChild.remove();
    this.cell.appendChild(container);
  }

  toggle(ev){
    this.collapsed = this.row.classList.toggle("coll");
    setToggle(this.$toggle, this.collapsed);
  
    if (this.collapsed) {
      fold(this.row);
    } else {
      unfold(this.row);
    }
  
    if (document.getElementById("logout")) {
      new Image().src = "collapse?id=" + this.id + (this.collapsed ? "" : "&un=true");
    }
  
    if(ev)
      ev.stopPropagation();
    
    return false;
  }
}

const fixComment = {
  query: ".athing.comtr",

  flag: "level",

  chain: [],

  hide: null,

  run(row) {
    const cell = row.cells[0];
    const toggle = cell.querySelector("a.togg");
    const ind = cell.querySelector(".ind img");
    const innerRow = cell.querySelector("table tr");
    if (!ind || !toggle || !cell || !innerRow) {
      log("incomplete", row);
      return false; 
    }

    let comment = new Comment(row, cell, toggle);

    let level = +ind.getAttribute("width") / 40;
    while(this.chain.length > level)
      this.chain.pop();

    let parents = this.chain.slice(0);
    this.chain.push(comment)

    if (this.hide != null && level > this.hide) {
      comment.hide()
    }else{
      this.hide = comment.collapsed ? level : null;
    }

    comment.make(innerRow.cells, parents);

    return level; 
  },
};

const stripStyle = {
  query: "link",

  flag: "strip-style",

  mode: "first",

  run(link){
    let sheet = link.sheet;
    try{
      let ruleList = sheet.cssRules;
      for (let i=0; i < ruleList.length; i++) {
        let rule = ruleList[i];
        if(rule instanceof CSSMediaRule && rule.cssRules.length > 30){
          sheet.deleteRule(i);
        }
      }
    }catch(er){
      return false;
    }
  }
}

const addBest = {
  query: ".pagetop",

  flag: "add-best",

  mode: "first",

  run(pagetop) {
    let bestlink = '<a href="best">best</a>';

    const op = document.documentElement.getAttribute("op");
    if (op == "best") {
      pagetop.lastChild.remove();
      pagetop.lastChild.remove();
      pagetop.lastChild.remove();
      bestlink = `<span class="topsel">${bestlink}</span>`;
    }

    let newest = pagetop.firstElementChild;
    newest.insertAdjacentHTML("afterend", `${bestlink} | `);
  },
};

const fixItem = {
  query: "table.itemlist > tbody > tr.athing",

  flag: "fix-item",

  run(thing) {
    let storyLink = thing.querySelector("a.storylink");
    let storyUrl = storyLink.href;

    let siteLink, siteUrl;
    if (storyLink.nextSibling !== null) {
      siteLink = storyLink.nextSibling.querySelector("a");
      siteUrl = siteLink.href;
    }

    let subtext = thing.nextSibling.querySelector("td.subtext");

    let commentLink = subtext.lastElementChild;
    let commentUrl = commentLink.href;

    storyLink.href = commentUrl;

    if (siteUrl) {
      siteLink.href = storyUrl;
      commentLink.insertAdjacentHTML(
        "beforebegin",
        `<a href="${siteUrl}">domain</a> | `
      );
    }
  },
};

function dashToCamel(word) {
  let i = word.indexOf("-");
  if (i == -1) return word;

  return (
    word.slice(0, i) +
    word.charAt(i + 1).toUpperCase() +
    dashToCamel(word.slice(i + 2))
  );
}

let domLoaded = false;
document.addEventListener("DOMContentLoaded", (event) => {
  document.removeEventListener("DOMContentLoaded", onready);
  domLoaded = true;
});

const Runner = {
  tasks: [],

  add(task) {
    task.flagJs = dashToCamel(task.flag);
    task.nonFlagged = `${task.query}:not([data-${task.flag}])`;
    Runner.tasks.push(task);
  },

  i: 0,

  exec(task, match) {
    log("Runner#exec", task.flag);

    match.dataset[task.flagJs] = "";

    let result = task.run(match) ?? "";

    if (result !== false) match.dataset[task.flagJs] = result;
    else delete match.dataset[task.flagJs];

    return result === false;
  },

  tick() {
    log(
      "Runner#tick",
      Runner.done ? "done" : Runner.i++,
      "(" + Runner.tasks.map((task) => task.flag).join(", ") + ")"
    );
    Runner.tasks = Runner.tasks.filter((task) => {
      if (task.mode === "first") {
        let match = document.querySelector(task.query);
        if (match === null)
          return true;

        if (match.dataset[task.flagJs] == null)
          return Runner.exec(task, match);
        else
          return false;
      } else {
        let matches = document.querySelectorAll(task.nonFlagged);
        matches.forEach((match) => Runner.exec(task, match));
        return true;
      }
    });

    return Runner.tasks.length > 0;
  },

  start(...tasks) {
    log("Runner#start");

    tasks.forEach(Runner.add);

    // DEPRECATED: ticking on animationFrame
    // let doTick = () => {
    // 	let cont = Runner.tick();
    //   if(!cont) return;
    //   window.requestAnimationFrame(domLoaded ? Runner.tick : doTick);
    // };

    // Better method: ticking on DOM change
    let observing = false;
    let observer = null;
    let doTick = () => {
      let cont = Runner.tick();

      if (cont == observing) return;

      if (cont) observer.observe(document, { subtree: true, childList: true });
      else observer.disconnect();

      observing = cont;
    };
    observer = new MutationObserver(doTick);

    doTick();
  },
};

Runner.start(fixItem, fixComment, addBest, loadMore, stripStyle);
