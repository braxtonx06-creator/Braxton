// Seed data for Braxton OS.
// This is the "memory" the app starts from. Edit it directly, or use the
// Memory tab's Import box and then "Export data" to regenerate this file.
// It is a plain script (not JSON fetched over HTTP) so the app also works
// when index.html is opened straight from disk.
window.OS_SEED = {
  version: 1,
  profile: {
    name: "Braxton",
    tagline: "My personal operating system",
    values: [],
    focus: ""
  },
  // Facts, preferences and context: one entry per memory line.
  memory: [
    // { id: "m1", category: "About me", text: "..." }
  ],
  goals: [
    // { id: "g1", title: "...", horizon: "This year", progress: 0, done: false }
  ],
  projects: [
    // { id: "p1", name: "...", status: "Active", notes: "" }
  ],
  tasks: [
    // { id: "t1", title: "...", projectId: "", due: "", done: false }
  ],
  habits: [
    // { id: "h1", name: "...", log: { "2026-09-27": true } }
  ],
  notes: [
    // { id: "n1", title: "...", body: "...", updated: "2026-09-27" }
  ]
};
