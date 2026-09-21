# Original practice scenarios

Each scenario was written for this app and uses a fictional setting. Canned model responses make walkthroughs reproducible without API calls; they are demonstrations, not evidence about real organizations.

| Scenario | Method | What changes across the session |
|---|---|---|
| An extra evening at the garden | Pros-and-cons analysis | Arguments become weighted consequences and a conditional trial. |
| Feedback waits in the queue | Five Whys | A supported causal chain ends in an evidence check, with alternatives retained. |
| Tool kits return incomplete | Cause-and-effect / fishbone analysis | Categories become causal branches and discriminating observations. |
| One feature for the volunteer portal | Decision matrix | Shared weights and scores produce totals and a sensitivity check. |
| A quieter museum evening | Brainstorming with prioritization | Independent ideas become comparable candidates and a ranked trial. |
| Does a clearer course title help? | Hypothesis testing | An uncertain explanation becomes a predeclared comparison; missing results remain missing. |

`npm run record -- <scenario-id>` in engine regenerates replay and walkthrough JSON through the real session gates. `npm run build:site` publishes the current six examples and removes stale generated pages.

The previous demonstrations are preserved only in `archive/retired-method-content/`, outside the served and built asset directories.
