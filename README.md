# copy-box

A Claude Code mod that puts copy-ready text in a box with a Copy button. Commands, commit messages and PR descriptions copy exactly as written, with no stray line breaks from your window width.

## What you get

- **Copy boxes:** anything Claude means for pasting shows in a bordered box with a **Copy** button
- **Markdown boxes:** PR descriptions, comments and Slack posts also get:
  - **Raw** and **Preview** tabs
  - **Preview in (your browser):** opens the markdown as a GitHub-styled page
  - **Copy for Slack:** copies formatted text, so bold, lists, links and checkboxes survive the paste
- **Copied:** each button confirms the copy for a couple of seconds
- **`/grab`:** copies the newest box from the keyboard. `/grab 2` copies the one before it
- **No setup for Claude:** the mod teaches Claude when to use a box and when to make it markdown

## Install

At the Claude Code prompt:

```
/plugin install copy-box --marketplace mackenzieholtzmann/claude-copy-box
```

1. Answer `y` to add the marketplace
2. Pick where to install it (the user scope is the default)
3. Pick your color and browser

It starts working right away.

From a shell instead:

```
claude plugin install copy-box --marketplace mackenzieholtzmann/claude-copy-box
```

If the repository is private, you need access to it on GitHub, and your machine needs a GitHub credential already set up (an SSH key, or `gh auth login` then `gh auth setup-git`).

## Settings

Set during install, and changeable any time in `/config`.

- **Copy box color:** lavender (default, follows your theme's inline code color), aqua, grey, orange or green
- **Preview browser:** Google Chrome (default), Firefox, Firefox Nightly, Firefox Developer Edition or Safari

## Requirements

- **Fullscreen mode for the buttons:** clicks only work in Claude Code's fullscreen layout. Turn it on with `/tui fullscreen`. In the regular layout the boxes still show, and `/grab` still copies
- **macOS for two buttons:** Copy for Slack and Preview in browser use macOS tools. Copy, the tabs and `/grab` work everywhere

## Troubleshooting

- **Claude sent a code block instead of a box:** ask it to "put that in a copy box"
- **The wrong kind of box:** ask for it "as markdown" or "plain"
- **Preview does nothing:** check that the browser in `/config` is installed
- **iTerm2 says the terminal tried to access the clipboard:** turn on Settings > General > Selection > "Applications in terminal may access clipboard"

## How it works

Claude wraps paste-ready text in a `<copy label="...">` line and a `</copy>` line, adding `format="markdown"` for markdown. The mod hides those lines and draws the box in their place. Browser previews are written to `/private/tmp/copy-box-previews`.
