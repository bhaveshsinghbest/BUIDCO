### Task 1: Analyze the Entire Project

* Review and analyze the complete project before making changes.
* Implement all required changes mentioned below.
* Ensure that no existing functionality, responsiveness, UI behavior, or project-related features are affected.
* Verify the complete application after implementation to ensure there are no regressions.

### Task 2: Remove Milestone Section from Project Description

* Navigate to the **Projects** section from the left-side panel and click on any individual project..
* Navigate to **Tender Dashboard → Dashboard** and click on any individual project.
* The individual project description/details page is displayed.
* Remove the **Milestone** section from the individual project description/details.
* Ensure that removing the Milestone section does not affect any other project details or functionality.

### Task 3: Fix Auto Logout and Set Inactivity Timeout

* Currently, the dashboard is automatically logging out users multiple times even when they are active.
* Identify and fix the existing auto-logout issue.
* Implement an inactivity-based session timeout.
* The user should be automatically logged out only when there has been **no user activity for 1 hour**.
* Any valid user activity should reset the 1-hour inactivity timer.
* Ensure that active users are not logged out unexpectedly.

### Task 4: Add Colour Coding to Project Remarks

* In the **Tender Dashboard**, navigate through the left-side panel.
* When clicking on any block, the corresponding detail table is displayed.
* In the **Remark** column, implement colour coding for each project's remark.
* Analyze the meaning/status of each remark and apply an appropriate colour such as:

  * **Red** – Critical issue / major delay / urgent action required
  * **Green** – Completed / resolved / satisfactory
  * **Blue** – Information / normal status / under process
  * Use other suitable colours where required.
* Apply the colour coding consistently across all relevant project tables.
* Ensure that the colour coding is meaningful and does not reduce readability or responsiveness.

### Task 5: Fix Left-Side Panel Visibility and Collapse Functionality

* When opening the **Tender Dashboard**, the left-side navigation panel should be visible by default.
* The **collapse/expand** functionality of the left-side panel should work correctly.
* Currently, the left-side panel is not consistently visible when opening the Tender Dashboarf, while it appears when navigating through other left panel  sections.
* Fix this inconsistent behavior.
* Ensure that the sidebar maintains the expected state across navigation and section changes without affecting the existing layout or responsiveness.

### Task 6: Verify and Fix Project Count Mismatch

* There are a total of **50 projects** available in the system.
* The project count/data displayed in the following sections does not match the total available projects:

  1. **Overview → Active Projects → Current Stage**
  2. **Sector Snapshot**
* Both sections are currently displaying fewer projects than the total 50 projects.
* Recheck the underlying data, filtering, grouping, status logic, and calculation used in both sections.
* If the displayed lower count is correct due to a specific business rule/filter, explain clearly why fewer than 50 projects are displayed.
* If the count is incorrect, identify and fix the issue so that the data is displayed correctly.
* Ensure that both sections use consistent and accurate project data.

### Task 7: Fix Outstanding Gap Column Layout

* Navigate to the **Projects** section from the left-side panel.
* The **Outstanding Gap** data for each project is currently overlapping/contradicting the data displayed in other columns.
* Modify the table layout so that the Outstanding Gap content wraps properly within its column.
* Ensure that long Outstanding Gap text does not overlap, hide, or affect the data of adjacent columns.
* Maintain proper alignment, readability, responsiveness, and table usability across desktop and mobile/tablet views.

### Final Verification

After completing all tasks:

* Test all affected sections and navigation flows.
* Verify desktop, tablet, and mobile responsiveness.
* Verify that no existing functionality has been broken.
* Verify project counts and data consistency.
* Verify sidebar visibility/collapse behavior.
* Verify session timeout behavior.
* Verify remark colour coding.
* Verify table wrapping and column alignment.
* Fix any regression or UI issues found during testing.
