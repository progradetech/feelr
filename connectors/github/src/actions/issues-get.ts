/**
 * issues.get -- Get a single issue by number.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenIssue } from '../flatten'
import { requireCredential, parseRepo } from '../utils'

export const issuesGet: ActionDefinition = {
  name: 'issues.get',
  description:
    'Gets a single issue by number. Accepts "repo" (required, "owner/repo") and ' +
    '"issue_number" (required, integer). Returns a single flattened issue object with ' +
    '{id, number, state, state_reason, title, body, user_login, assignee_login, labels, comments, created_at, updated_at, closed_at}.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'issue_number', type: 'number', required: true, description: 'Issue number to retrieve' },
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

    const result = await githubFetch<Record<string, unknown>>({
      path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenIssue(result.data),
      raw: result.data,
    }
  },
}
