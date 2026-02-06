/**
 * issues.update -- Update an existing issue.
 *
 * Only sends provided fields to avoid overwriting unchanged data.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenIssue } from '../flatten'
import { requireCredential, parseRepo } from '../utils'

export const issuesUpdate: ActionDefinition = {
  name: 'issues.update',
  description:
    'Updates an existing issue. Accepts "repo" (required, "owner/repo"), "issue_number" (required), ' +
    'and optional "title", "body", "state" (open/closed), "labels" (comma-separated), ' +
    '"assignees" (comma-separated). Only provided fields are updated. Returns the updated issue.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'issue_number', type: 'number', required: true, description: 'Issue number to update' },
    { name: 'title', type: 'string', required: false, description: 'New issue title' },
    { name: 'body', type: 'string', required: false, description: 'New issue body (markdown supported)' },
    { name: 'state', type: 'string', required: false, description: 'New state: open or closed' },
    { name: 'labels', type: 'string', required: false, description: 'Comma-separated label names (replaces all labels)' },
    { name: 'assignees', type: 'string', required: false, description: 'Comma-separated GitHub usernames (replaces all assignees)' },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const [owner, repo] = parseRepo(ctx.params.repo)

    const issueNumber = ctx.params.issue_number
    if (!issueNumber) {
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'issue_number is required',
        hint: 'abort',
        status: 400,
      })
    }

    // Only include provided fields
    const body: Record<string, unknown> = {}

    if (ctx.params.title !== undefined) {
      body.title = ctx.params.title as string
    }
    if (ctx.params.body !== undefined) {
      body.body = ctx.params.body as string
    }
    if (ctx.params.state !== undefined) {
      body.state = ctx.params.state as string
    }
    if (ctx.params.labels !== undefined) {
      body.labels = (ctx.params.labels as string).split(',').map((s) => s.trim())
    }
    if (ctx.params.assignees !== undefined) {
      body.assignees = (ctx.params.assignees as string).split(',').map((s) => s.trim())
    }

    const result = await githubFetch<Record<string, unknown>>({
      path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
      method: 'PATCH',
      body,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenIssue(result.data),
      raw: result.data,
    }
  },
}
