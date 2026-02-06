/**
 * issues.close -- Close an issue.
 *
 * Convenience action that wraps issues.update with { state: "closed" }.
 * Agents don't need to know the underlying API -- just call issues.close.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenIssue } from '../flatten'
import { requireCredential, parseRepo } from '../utils'

export const issuesClose: ActionDefinition = {
  name: 'issues.close',
  description:
    'Closes an issue. Accepts "repo" (required, "owner/repo"), "issue_number" (required), ' +
    'optional "state_reason" (completed or not_planned, default: completed). ' +
    'Returns the closed issue with updated state and state_reason.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'issue_number', type: 'number', required: true, description: 'Issue number to close' },
    { name: 'state_reason', type: 'string', required: false, description: 'Reason: completed or not_planned', default: 'completed' },
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

    const stateReason = (ctx.params.state_reason as string) ?? 'completed'

    const result = await githubFetch<Record<string, unknown>>({
      path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
      method: 'PATCH',
      body: {
        state: 'closed',
        state_reason: stateReason,
      },
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenIssue(result.data),
      raw: result.data,
    }
  },
}
