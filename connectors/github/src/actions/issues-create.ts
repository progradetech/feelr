/**
 * issues.create -- Create a new issue in a repository.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenIssue } from '../flatten'
import { requireCredential, parseRepo } from '../utils'

export const issuesCreate: ActionDefinition = {
  name: 'issues.create',
  description:
    'Creates a new issue in a repository. Accepts "repo" (required, "owner/repo"), "title" (required), ' +
    'optional "body", "labels" (comma-separated), "assignees" (comma-separated). ' +
    'Returns the created issue as {id, number, state, title, body, user_login, labels, created_at}.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'title', type: 'string', required: true, description: 'Issue title' },
    { name: 'body', type: 'string', required: false, description: 'Issue body (markdown supported)' },
    { name: 'labels', type: 'string', required: false, description: 'Comma-separated label names' },
    { name: 'assignees', type: 'string', required: false, description: 'Comma-separated GitHub usernames to assign' },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const [owner, repo] = parseRepo(ctx.params.repo)

    if (!ctx.params.title) {
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'title is required',
        hint: 'abort',
        status: 400,
      })
    }

    const body: Record<string, unknown> = {
      title: ctx.params.title as string,
    }

    if (ctx.params.body) {
      body.body = ctx.params.body as string
    }

    if (ctx.params.labels) {
      body.labels = (ctx.params.labels as string).split(',').map((s) => s.trim())
    }

    if (ctx.params.assignees) {
      body.assignees = (ctx.params.assignees as string).split(',').map((s) => s.trim())
    }

    const result = await githubFetch<Record<string, unknown>>({
      path: `/repos/${owner}/${repo}/issues`,
      method: 'POST',
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
