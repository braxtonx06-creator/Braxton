# Braxton OS

A personal operating system that runs in the browser: one place for memory, goals, projects, tasks, habits and notes.

## Run it

Open `index.html` in a browser. You don't need to build or install anything. It also works on GitHub Pages.

## Where data lives

- **`data/os-data.js`**: the seed "memory" the app starts from. Keep it in the repo as the permanent record.
- **Browser storage**: your edits are saved in this browser automatically.
- **Export data**: downloads an updated `os-data.js`. Replace `data/os-data.js` with it and commit to save your changes to the repo.
- **Import file**: loads an exported file on another device or browser.

## Importing memory from another AI

In the **Memory** tab, paste the memory export into **Import memory**. The parser understands:

```
## About me          <- heading becomes the category
- Lives in Texas     <- bullet becomes an entry
Work: Building X     <- "Category: fact" becomes an entry in that category
```
