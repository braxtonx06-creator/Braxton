// Braxton OS: a single-page personal operating system.
// State is seeded from data/os-data.js and saved to localStorage on every change.

const STORAGE_KEY = "braxton-os";
const $ = (sel, root = document) => root.querySelector(sel);

let state = load();
let currentView = "dashboard";

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalize(JSON.parse(saved));
  } catch (e) { /* storage unavailable or corrupt: fall back to seed */ }
  return normalize(structuredClone(window.OS_SEED || {}));
}

function normalize(data) {
  return {
    version: 1,
    profile: { name: "Braxton", tagline: "", values: [], focus: "", ...(data.profile || {}) },
    memory: data.memory || [],
    goals: data.goals || [],
    projects: data.projects || [],
    tasks: data.tasks || [],
    habits: data.habits || [],
    notes: data.notes || [],
  };
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  render();
}

const uid = () => Math.random().toString(36).slice(2, 10);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => ymd(new Date());
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function lastDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

function streak(habit) {
  let count = 0;
  const d = new Date();
  while (habit.log[ymd(d)]) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

// Turns pasted memory text into entries. Understands:
//   ## Heading        -> sets the category for the lines below it
//   Category: text    -> one entry in that category
//   - text / * text   -> one entry in the current category
function parseMemory(text) {
  const entries = [];
  let category = "General";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) { category = heading[1].trim(); continue; }
    const body = line.replace(/^[-*•]\s+|^\d+[.)]\s+/, "");
    const pair = body.match(/^([A-Za-z][\w &/'-]{1,40}):\s+(.+)$/);
    if (pair) entries.push({ id: uid(), category: pair[1].trim(), text: pair[2].trim() });
    else entries.push({ id: uid(), category, text: body });
  }
  return entries;
}

// ---------- views ----------

const views = {
  dashboard() {
    const openTasks = state.tasks.filter((t) => !t.done);
    const dueSoon = openTasks
      .filter((t) => t.due)
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 5);
    const activeGoals = state.goals.filter((g) => !g.done);
    const day = today();
    return `
      <div class="grid">
        <div class="card">
          <h3>Focus</h3>
          <p>${esc(state.profile.focus) || '<span class="empty">Set your current focus in the Memory tab.</span>'}</p>
        </div>
        <div class="card"><h3>Open tasks</h3><div class="stat">${openTasks.length}</div></div>
        <div class="card"><h3>Active goals</h3><div class="stat">${activeGoals.length}</div></div>
        <div class="card"><h3>Memory entries</h3><div class="stat">${state.memory.length}</div></div>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="card">
          <h2>Up next</h2>
          ${dueSoon.length ? `<ul class="list">${dueSoon.map((t) => `
            <li><input type="checkbox" data-toggle-task="${t.id}"><span class="grow">${esc(t.title)}</span><span class="tag">${esc(t.due)}</span></li>`).join("")}</ul>`
            : '<p class="empty">No tasks with due dates.</p>'}
        </div>
        <div class="card">
          <h2>Today's habits</h2>
          ${state.habits.length ? `<ul class="list">${state.habits.map((h) => `
            <li><input type="checkbox" data-habit-day="${h.id}|${day}" ${h.log[day] ? "checked" : ""}>
            <span class="grow">${esc(h.name)}</span><span class="tag">${streak(h)} day streak</span></li>`).join("")}</ul>`
            : '<p class="empty">No habits yet.</p>'}
        </div>
        <div class="card">
          <h2>Goals</h2>
          ${activeGoals.length ? activeGoals.map((g) => `
            <div style="margin-bottom:12px">${esc(g.title)} <span class="muted">· ${esc(g.horizon)}</span>
            <div class="bar"><span style="width:${g.progress}%"></span></div></div>`).join("")
            : '<p class="empty">No active goals.</p>'}
        </div>
      </div>`;
  },

  memory() {
    const groups = {};
    for (const m of state.memory) (groups[m.category] ||= []).push(m);
    const p = state.profile;
    return `
      <div class="grid">
        <div class="card">
          <h2>Profile</h2>
          <form id="profile-form">
            <p><label>Name<input name="name" value="${esc(p.name)}"></label></p>
            <p><label>Tagline<input name="tagline" value="${esc(p.tagline)}"></label></p>
            <p><label>Current focus<input name="focus" value="${esc(p.focus)}"></label></p>
            <p><label>Values (comma separated)<input name="values" value="${esc(p.values.join(", "))}"></label></p>
            <button>Save profile</button>
          </form>
        </div>
        <div class="card">
          <h2>Import memory</h2>
          <p class="muted">Paste memory exported from another AI assistant. Use "## Heading" lines for categories,
          "Category: fact" lines, or bullet lists.</p>
          <form id="memory-import">
            <textarea name="text" placeholder="## About me&#10;- Name is Braxton&#10;Work: ..."></textarea>
            <p><button>Import</button></p>
          </form>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Memory</h2>
        <form class="row" id="memory-add">
          <input name="category" placeholder="Category" list="memory-cats">
          <input name="text" placeholder="Something to remember" required style="flex:3 1 260px">
          <datalist id="memory-cats">${Object.keys(groups).map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
          <button>Add</button>
        </form>
        <input id="memory-search" placeholder="Search memory…" style="margin-bottom:16px">
        <div id="memory-groups">
          ${Object.keys(groups).length ? Object.entries(groups).map(([cat, items]) => `
            <div class="memory-group">
              <h3>${esc(cat)} <span class="muted">(${items.length})</span></h3>
              <ul class="list">${items.map((m) => `
                <li data-search="${esc((cat + " " + m.text).toLowerCase())}">
                  <span class="grow">${esc(m.text)}</span>
                  <button class="icon" data-delete="memory|${m.id}" title="Delete">✕</button></li>`).join("")}</ul>
            </div>`).join("") : '<p class="empty">No memory yet. Import or add entries above.</p>'}
        </div>
      </div>`;
  },

  goals() {
    return `
      <div class="card">
        <h2>Goals</h2>
        <form class="row" id="goal-add">
          <input name="title" placeholder="Goal" required style="flex:3 1 240px">
          <select name="horizon"><option>This month</option><option>This quarter</option><option selected>This year</option><option>Long term</option></select>
          <button>Add</button>
        </form>
        ${state.goals.length ? `<ul class="list">${state.goals.map((g) => `
          <li class="${g.done ? "done" : ""}">
            <input type="checkbox" data-toggle="goals|${g.id}" ${g.done ? "checked" : ""}>
            <span class="grow">${esc(g.title)} <span class="muted">· ${esc(g.horizon)}</span>
              <div class="bar"><span style="width:${g.progress}%"></span></div></span>
            <input type="range" min="0" max="100" step="5" value="${g.progress}" data-progress="${g.id}" style="width:120px">
            <button class="icon" data-delete="goals|${g.id}" title="Delete">✕</button></li>`).join("")}</ul>`
          : '<p class="empty">No goals yet.</p>'}
      </div>`;
  },

  projects() {
    return `
      <div class="card">
        <h2>Projects</h2>
        <form class="row" id="project-add">
          <input name="name" placeholder="Project name" required style="flex:3 1 240px">
          <select name="status"><option>Active</option><option>Planned</option><option>Paused</option><option>Done</option></select>
          <button>Add</button>
        </form>
        ${state.projects.length ? `<ul class="list">${state.projects.map((p) => {
          const open = state.tasks.filter((t) => t.projectId === p.id && !t.done).length;
          return `<li>
            <span class="grow"><strong>${esc(p.name)}</strong> <span class="muted">· ${open} open task${open === 1 ? "" : "s"}</span></span>
            <select data-status="${p.id}" style="width:auto">${["Active", "Planned", "Paused", "Done"].map((s) =>
              `<option ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}</select>
            <button class="icon" data-delete="projects|${p.id}" title="Delete">✕</button></li>`;
        }).join("")}</ul>` : '<p class="empty">No projects yet.</p>'}
      </div>`;
  },

  tasks() {
    const sorted = [...state.tasks].sort((a, b) => a.done - b.done || (a.due || "9999").localeCompare(b.due || "9999"));
    const projectName = (id) => state.projects.find((p) => p.id === id)?.name;
    return `
      <div class="card">
        <h2>Tasks</h2>
        <form class="row" id="task-add">
          <input name="title" placeholder="Task" required style="flex:3 1 240px">
          <select name="projectId"><option value="">No project</option>${state.projects.map((p) =>
            `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
          <input name="due" type="date">
          <button>Add</button>
        </form>
        ${sorted.length ? `<ul class="list">${sorted.map((t) => `
          <li class="${t.done ? "done" : ""}">
            <input type="checkbox" data-toggle="tasks|${t.id}" ${t.done ? "checked" : ""}>
            <span class="grow">${esc(t.title)}</span>
            ${projectName(t.projectId) ? `<span class="tag">${esc(projectName(t.projectId))}</span>` : ""}
            ${t.due ? `<span class="muted">${esc(t.due)}</span>` : ""}
            <button class="icon" data-delete="tasks|${t.id}" title="Delete">✕</button></li>`).join("")}</ul>`
          : '<p class="empty">No tasks yet.</p>'}
      </div>`;
  },

  habits() {
    const days = lastDays(7);
    return `
      <div class="card">
        <h2>Habits</h2>
        <form class="row" id="habit-add">
          <input name="name" placeholder="New habit" required style="flex:3 1 240px">
          <button>Add</button>
        </form>
        ${state.habits.length ? `<ul class="list">${state.habits.map((h) => `
          <li>
            <span class="grow">${esc(h.name)} <span class="muted">· ${streak(h)} day streak</span></span>
            <div class="habit-days">${days.map((d) => `
              <button class="${h.log[d] ? "on" : ""}" data-habit-day="${h.id}|${d}" title="${d}">${d.slice(8)}</button>`).join("")}</div>
            <button class="icon" data-delete="habits|${h.id}" title="Delete">✕</button></li>`).join("")}</ul>`
          : '<p class="empty">No habits yet.</p>'}
      </div>`;
  },

  notes() {
    const sorted = [...state.notes].sort((a, b) => b.updated.localeCompare(a.updated));
    return `
      <div class="card">
        <h2>New note</h2>
        <form id="note-add">
          <p><input name="title" placeholder="Title" required></p>
          <p><textarea name="body" placeholder="Write…"></textarea></p>
          <button>Save note</button>
        </form>
      </div>
      <div class="grid" style="margin-top:16px">
        ${sorted.length ? sorted.map((n) => `
          <div class="card">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <h3>${esc(n.title)}</h3>
              <button class="icon" data-delete="notes|${n.id}" title="Delete">✕</button>
            </div>
            <p class="muted">${esc(n.updated)}</p>
            <p style="white-space:pre-wrap">${esc(n.body)}</p>
          </div>`).join("") : '<p class="empty">No notes yet.</p>'}
      </div>`;
  },
};

// ---------- rendering & events ----------

function render() {
  $("#os-name").textContent = `${state.profile.name || "My"} OS`;
  $("#os-tagline").textContent = state.profile.tagline || "";
  document.title = `${state.profile.name || "My"} OS`;
  $("#view").innerHTML = views[currentView]();
  for (const b of document.querySelectorAll("#tabs button")) b.classList.toggle("active", b.dataset.view === currentView);
}

const formHandlers = {
  "profile-form": (f) => {
    Object.assign(state.profile, {
      name: f.name.value.trim(),
      tagline: f.tagline.value.trim(),
      focus: f.focus.value.trim(),
      values: f.values.value.split(",").map((v) => v.trim()).filter(Boolean),
    });
  },
  "memory-import": (f) => { state.memory.push(...parseMemory(f.text.value)); },
  "memory-add": (f) => { state.memory.push({ id: uid(), category: f.category.value.trim() || "General", text: f.text.value.trim() }); },
  "goal-add": (f) => { state.goals.push({ id: uid(), title: f.title.value.trim(), horizon: f.horizon.value, progress: 0, done: false }); },
  "project-add": (f) => { state.projects.push({ id: uid(), name: f.name.value.trim(), status: f.status.value, notes: "" }); },
  "task-add": (f) => { state.tasks.push({ id: uid(), title: f.title.value.trim(), projectId: f.projectId.value, due: f.due.value, done: false }); },
  "habit-add": (f) => { state.habits.push({ id: uid(), name: f.name.value.trim(), log: {} }); },
  "note-add": (f) => { state.notes.push({ id: uid(), title: f.title.value.trim(), body: f.body.value, updated: today() }); },
};

document.addEventListener("submit", (e) => {
  const handler = formHandlers[e.target.id];
  if (!handler) return;
  e.preventDefault();
  handler(e.target);
  save();
});

document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.dataset.view) { currentView = t.dataset.view; render(); return; }
  if (t.dataset.delete) {
    const [coll, id] = t.dataset.delete.split("|");
    if (!confirm("Delete this item?")) return;
    state[coll] = state[coll].filter((x) => x.id !== id);
    if (coll === "projects") state.tasks.forEach((task) => { if (task.projectId === id) task.projectId = ""; });
    save();
    return;
  }
  if (t.dataset.habitDay) {
    const [id, day] = t.dataset.habitDay.split("|");
    const h = state.habits.find((x) => x.id === id);
    if (h.log[day]) delete h.log[day]; else h.log[day] = true;
    save();
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.toggle) {
    const [coll, id] = t.dataset.toggle.split("|");
    const item = state[coll].find((x) => x.id === id);
    item.done = t.checked;
    if (coll === "goals" && item.done) item.progress = 100;
    save();
  } else if (t.dataset.toggleTask) {
    state.tasks.find((x) => x.id === t.dataset.toggleTask).done = true;
    save();
  } else if (t.dataset.progress) {
    state.goals.find((x) => x.id === t.dataset.progress).progress = Number(t.value);
    save();
  } else if (t.dataset.status) {
    state.projects.find((x) => x.id === t.dataset.status).status = t.value;
    save();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id !== "memory-search") return;
  const q = e.target.value.toLowerCase();
  for (const li of document.querySelectorAll("#memory-groups li")) li.hidden = !li.dataset.search.includes(q);
});

// Export writes a data/os-data.js you can commit back into the repo.
$("#export-btn").addEventListener("click", () => {
  const js = `// Seed data for Braxton OS (exported ${today()}).\nwindow.OS_SEED = ${JSON.stringify(state, null, 2)};\n`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
  a.download = "os-data.js";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const json = text.trim().startsWith("{") ? text : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    state = normalize(JSON.parse(json));
    save();
  } catch (err) {
    alert("Could not read that file: " + err.message);
  }
  e.target.value = "";
});

render();
