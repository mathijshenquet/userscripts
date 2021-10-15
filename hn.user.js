// ==UserScript==
// @name        HNq
// @match       http*://*/*
// @version     0.2
// @author      mthq
// @grant       GM_getResourceText
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// @resource    style ./hn.user.css
// @noframes
// @downloadURL https://raw.githubusercontent.com/mathijshenquet/userscripts/master/hn.user.js
// @run-at      document-start
// ==/UserScript==

function log(...args) {
  console.log("HNq", ...args);
}

let normalizeUrlRe = /^https?:\/\/(?:www\.)?(.*)$/

function normalizeUrl(url){
  let out = normalizeUrlRe.exec(url);
  return out?.[1] ?? url;
}

function registerStory(storyUrl, commentUrl){
  let key = normalizeUrl(storyUrl);
  log("Register", key, commentUrl);
  GM_setValue(key, commentUrl)
}

function queryStory(urls){
  let hnLink = null;
  urls.some((url) => {
    let key = normalizeUrl(url);
    log("try", key);
    
    if(hnLink = GM_getValue(key)){
      return true;
    }
  })
  return hnLink;
}

function mainHN(){

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
    let level = +target.dataset.level;
    while (cursor && +cursor.dataset.level > level) {
      if (!dry) cursor.classList.add("noshow");
      cursor = cursor.nextElementSibling;
    }
    return cursor;
  }

  function unfold(target) {
    let cursor = target.nextElementSibling;
    let level = +target.dataset.level;
    while (cursor && +cursor.dataset.level > level) {
      cursor.classList.remove("noshow");
      if (cursor.classList.contains("coll")) {
        cursor = fold(cursor, true);
      } else {
        cursor = cursor.nextElementSibling;
      }
    }
  }

  function setToggle(toggle, collapsed) {
    toggle.innerText = collapsed ? `[${toggle.getAttribute("n")} more]` : "[–]";
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

  let linkRE = /https?:\/\/(www\.)?([^\/]*)\/?(.*)/;
  const cropLinkLen = 60;
  function showLink(href) {
    let match = href.match(linkRE);
    if (match) {
      href = match[2];
      if (match[3].length > 0) {
        href += `/${match[3]}`;
      }
    }

    if (href.length >= cropLinkLen + 20) {
      return href.slice(0, cropLinkLen) + "⋯";
    } else {
      return href;
    }
  }

  class Comment {
    constructor(row, cell, $toggle) {
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

    hide() {
      this.hidden = true;
      this.row.classList.add("noshow");
    }

    makeInd() {
      let ind = mk(".ind");
      ind.dataset.id = this.id;
      mk(ind, ".stripe");

      ind.addEventListener("mouseenter", () => this.hover(true));
      ind.addEventListener("mouseleave", () => this.hover(false));
      ind.addEventListener("click", (ev) => this.toggle(ev));

      this.inds.push(ind);
      return ind;
    }

    hover(state) {
      this.row.classList.toggle("hover", state);
      this.inds.forEach((ind) => ind.classList.toggle("hover", state));
    }

    make(cells, parents) {
      this.parents = parents;

      let container = document.createElement("div");
      container.className = "comment-container";

      // make the indent
      parents.forEach((item) => {
        let indItem = item.makeInd();
        container.appendChild(indItem);
      });

      // add the other items
      for (let i = 1; i < cells.length; i++) {
        let cell = cells[i];

        let item = document.createElement("div");
        cell.classList.remove("nosee");
        item.className = cell.className;

        let child;
        while ((child = cell.firstElementChild)) {
          child.removeAttribute("style");
          child.classList.remove("noshow");
          if (child instanceof HTMLBRElement) child.remove();
          else item.appendChild(child);
        }

        if (i == 1) item.append(this.makeInd());

        container.appendChild(item);
      }

      this.container = container;
      this.cell.lastElementChild.remove();
      this.cell.appendChild(container);

      // add hover for comment head
      let comhead = container.querySelector(".comhead .togg");
      comhead.addEventListener("mouseenter", () => this.hover(true));
      comhead.addEventListener("mouseleave", () => this.hover(false));

      // improve links
      container.querySelectorAll(`.comment a[rel="nofollow"]`).forEach((link) => {
        console.log(link.innerText, link.innerText.length);
        link.innerText = showLink(link.href);
      });
    }

    toggle(ev) {
      this.collapsed = this.row.classList.toggle("coll");
      setToggle(this.$toggle, this.collapsed);

      if (this.collapsed) {
        fold(this.row);
      } else {
        unfold(this.row);
      }

      if (document.getElementById("logout")) {
        new Image().src =
          "collapse?id=" + this.id + (this.collapsed ? "" : "&un=true");
      }

      if (ev) ev.stopPropagation();

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
      while (this.chain.length > level) this.chain.pop();

      let parents = this.chain.slice(0);
      this.chain.push(comment);

      if (this.hide != null && level > this.hide) {
        comment.hide();
      } else {
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

    run(link) {
      let sheet = link.sheet;
      try {
        let ruleList = sheet.cssRules;
        for (let i = 0; i < ruleList.length; i++) {
          let rule = ruleList[i];
          if (rule instanceof CSSMediaRule && rule.cssRules.length > 30) {
            sheet.deleteRule(i);
          }
        }
      } catch (er) {
        return false;
      }
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

      registerStory(storyUrl, commentUrl);

      //storyLink.href = commentUrl;

      if (siteUrl) {
        //siteLink.href = storyUrl;
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

  const Runner = {
    tasks: [],

    add(task) {
      if (task.flag) {
        task.flagJs = dashToCamel(task.flag);
        task.nonFlagged = `${task.query}:not([data-${task.flag}])`;
      } else {
        task.nonFlagged = `${task.query}`;
      }
      Runner.tasks.push(task);
    },

    i: 0,

    exec(task, $match) {
      if (task.flag) {
        log("Runner#exec", task.flag);
        $match.dataset[task.flagJs] = "";

        let result = task.run($match) ?? "";

        if (result !== false) $match.dataset[task.flagJs] = result;
        else delete $match.dataset[task.flagJs];

        return result === false;
      } else {
        task.run($match);
        $match.remove();

        return true;
      }
    },

    tick() {
      log(
        "Runner#tick ",
        Runner.done ? "done" : Runner.i++,
        "(" + Runner.tasks.map((task) => task.flag).join(", ") + ")"
      );
      let toDo = Runner.tasks;
      Runner.tasks = [];
      let toDoLeft = toDo.filter((task) => {
        if (task.mode === "first") {
          let $match = document.querySelector(task.query);
          if ($match === null) return true;

          if ($match.dataset[task.flagJs] == null)
            return Runner.exec(task, $match);
          else return false;
        } else {
          let matches = document.querySelectorAll(task.nonFlagged);
          matches.forEach(($match) => Runner.exec(task, $match));
          return true;
        }
      });

      Runner.tasks.push(...toDoLeft);

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

  let re = /^([^\.#]+)?(#[^\.#]+)?((?:\.[^\.#]+)*)$/;
  function mk(arg0, arg1) {
    let desc, $target;
    if (arg1) {
      desc = arg1;
      $target = arg0;
    } else {
      desc = arg0;
    }

    let match = re.exec(desc);
    if (match === null) throw new Error(`Could not parse: ${desc}`);

    let type = match[1] ?? "div";
    let id = match[2];
    let classList = match[3].split(".").slice(1);

    let $elem = document.createElement(type);
    if (classList.length > 0) {
      $elem.className = classList.join(" ");
    }

    if (id) {
      $elem.id = id.slice(1); // chop of the '#'
    }

    if ($target) {
      $target.appendChild($elem);
    }

    return $elem;
  }

  let Page = {
    init($container) {
      this.$container = $container;

      function f(a) {
        return mk(mk($container, a), ".container");
      }

      this.$header = f("#header");
      this.$content = f("#content");
      this.$footer = mk($container, "#footer");
    },

    addHeader($logo, $nav, $user) {
      $logo.id = "head-logo";
      this.$header.append($logo);

      this.$header.append(this.fixNav($nav));

      $user.id = "head-user";
      this.$header.append($user);
    },

    fixNav($nav) {
      let bestlink = '<a href="best">best</a>';

      const op = document.documentElement.getAttribute("op");
      if (op == "best") {
        $nav.lastChild.remove();
        $nav.lastChild.remove();
        $nav.lastChild.remove();
        bestlink = `<span class="topsel">${bestlink}</span>`;
      }

      let newest = $nav.firstElementChild;
      newest.insertAdjacentHTML("afterend", `${bestlink} | `);

      $nav.id = "head-nav";
      return $nav;
    },
  };

  const reLayout = {
    query: "body",

    flag: "relayout",

    mode: "first",

    run($body) {
      let $hnmain = $body.querySelector("#hnmain");
      $hnmain.style.display = "none";

      let $container = mk($body, "div#page-container");

      Page.init($container);
    },
  };

  const fixHeader = {
    query: "table#hnmain > tbody > tr:first-child",

    flag: "flag",

    mode: "first",

    run(row) {
      let $head = row.querySelector("td > table");
      let xs = $head.rows[0].cells;

      Page.addHeader(
        xs[0].firstElementChild,
        xs[1].firstElementChild,
        xs[2].firstElementChild
      );
    },
  };

  const fixFooter = {
    query: "table#hnmain > tbody > tr:last-child",

    flag: "flag",

    mode: "once",

    run(row) {
      let $footer = row.querySelector("td > center");
      Page.$footer.append($footer);
    },
  };

  const fixContent = {
    query: "table#hnmain > tbody > tr:nth-child(3) > td > table",

    flag: "flag",

    run($content) {
      Page.$content.append($content);
    },
  };

  
  GM_addStyle(GM_getResourceText("style"));

  Runner.start(
    reLayout,
    fixHeader,
    fixFooter,
    fixContent,
    fixItem,
    fixComment,
    loadMore,
    stripStyle
  );
}

function linkback(hnlink){
  let linkback = document.createElement("a");

  linkback.style.display = "block";
  linkback.style.margin = "8px 8px 8px -4px";
  linkback.style.position = "fixed";
  linkback.style.left = "0";
  linkback.style.top = "30%";
  linkback.style.zIndex = "999";
  linkback.style.background = "white"
  linkback.style.padding = "1px";
  linkback.style.border = "1px solid #ff6600";
  linkback.style.textDecoration = "none";

  linkback.href = hnlink;

  let button = document.createElement("div");
  button.style.display = "block";
  button.style.width = "24px";
  button.style.height = "24px";
  button.style.background = "#ff6600";
  //button.style.border = "1px solid white";
  button.style.textAlign = "center";
  button.style.color = "white";
  button.style.fontFamily = "sans-serif";
  button.style.lineHeight = "24px";
  button.style.fontSize = "16px";

  button.innerHTML = "Y";

  linkback.append(button);

  document.body.append(linkback);
}

if(window.location.hostname === "news.ycombinator.com"){
  mainHN(); 
}else{
  document.addEventListener('DOMContentLoaded', () => {
    let urls = [window.location.href];
    document.head.querySelectorAll("link[rel][href]").forEach((meta) => {
      if(["alternate", "canonical"].indexOf(meta.rel) !== -1){
        urls.push(meta.href)
      }
    });

    let hnLink = queryStory(urls);
    if(hnLink){
      linkback(hnLink);
    }
  });
  
}