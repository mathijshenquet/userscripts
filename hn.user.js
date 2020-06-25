// ==UserScript==
// @name        HNq
// @match       https://news.ycombinator.com/*
// @grant       none
// @version     0.1
// @author      mthq
// @resource    style https://raw.githubusercontent.com/mathijshenquet/userscripts/master/hn.user.css
// @downloadURL https://raw.githubusercontent.com/mathijshenquet/userscripts/master/hn.user.js
// @grant       GM_getResourceText GM_addStyle
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

function toggle(ev, id) {
  let toggle = ev.target;
  log("toggle", id);

  let target = document.getElementById(id);
  let collapsed = target.classList.toggle("coll");
  setToggle(toggle, collapsed);

  if (collapsed) {
    fold(target);
  } else {
    unfold(target);
  }

  if (document.getElementById("logout")) {
    new Image().src = "collapse?id=" + id + (collapsed ? "" : "&un=true");
  }

  ev.stopPropagation();
  return false;
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

const fixIndent = {
  query: ".athing.comtr",

  flag: "level",

  state: null,

  run(comment) {
    let idStr = comment.getAttribute("id");
    const togg = comment.querySelector("a.togg");
    const ind = comment.querySelector(".ind img");
    if (!ind || !togg || !ind) {
      console.log(comment);
      return false;
    }

    const id = +idStr;
    togg.removeAttribute("onclick");
    togg.onclick = function () {
      return toggle(event, id);
    };

    const level = +ind.getAttribute("width") / 40;
    comment.style.setProperty("--lvl", level);

    if (this.state != null) {
      if (level > this.state) {
        comment.classList.add("noshow");
      } else {
        this.state = null;
      }
    }

    let collapsed = comment.classList.contains("coll");
    setToggle(togg, collapsed);
    if (collapsed && this.state == null) {
      console.log("set", level, comment);
      this.state = level;
    }

    return level;
  },
};

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
  },

  tick(next) {
    log(
      "Runner#tick",
      Runner.done ? "done" : Runner.i++,
      "(" + Runner.tasks.map((task) => task.flag).join(", ") + ")"
    );
    Runner.tasks = Runner.tasks.filter((task) => {
      if (task.mode === "first") {
        let match = document.querySelector(task.query);
        if (match === null) return true;
        if (match.dataset[task.flagJs] == null) Runner.exec(task, match);
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

Runner.start(fixItem, fixIndent, addBest, loadMore);
