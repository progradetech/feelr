---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified: [README.md]
autonomous: true

must_haves:
  truths:
    - "README.md has no TODO comment placeholders"
    - "Tagline and badges are properly spaced"
  artifacts:
    - path: "README.md"
      provides: "Clean project README"
      must_not_contain: "TODO: Add GIF demo"
  key_links:
    - from: "README.md line 7"
      to: "removed"
      via: "deletion"
      pattern: "<!-- TODO: Add GIF demo -->"
---

<objective>
Remove GIF placeholder comment from README.md (line 7) to finalize v1.0 milestone documentation.

Purpose: Clean up cosmetic placeholder before launch
Output: README.md without HTML comment line
</objective>

<execution_context>
@/home/eternaldays/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@README.md
</context>

<tasks>

<task type="auto">
  <name>Remove GIF placeholder comment from README</name>
  <files>README.md</files>
  <action>
Delete line 7 which contains the HTML comment `<!-- TODO: Add GIF demo -->`. This is a blank-line cleanup task -- the line sits between the tagline and the badge row. After deletion, there will still be proper spacing (blank line on line 6 before badges start on line 9).

Target file: /home/eternaldays/claudeRepos/feelr/README.md
Line to remove: `<!-- TODO: Add GIF demo -->`
  </action>
  <verify>
grep -n "TODO: Add GIF demo" /home/eternaldays/claudeRepos/feelr/README.md || echo "Placeholder removed successfully"
  </verify>
  <done>
grep command returns no matches (file no longer contains the placeholder comment), and README.md is valid markdown with proper spacing between tagline and badges.
  </done>
</task>

</tasks>

<verification>
- README.md line 7 no longer contains the GIF placeholder comment
- File is still valid markdown with proper structure
- Spacing between tagline and badges is preserved
</verification>

<success_criteria>
The HTML comment `<!-- TODO: Add GIF demo -->` is completely removed from README.md. No other content is modified.
</success_criteria>

<output>
After completion, create `.planning/quick/1-remove-gif-placeholder-in-readme/1-SUMMARY.md`
</output>
