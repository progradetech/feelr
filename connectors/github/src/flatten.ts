/**
 * Response flattening functions for GitHub resources.
 *
 * Each function takes a raw GitHub API response object and extracts
 * only the essential fields, eliminating nested objects and reducing
 * token overhead for agent consumption.
 *
 * Field counts: Issue (13), Pull Request (15), Repository (12).
 * All dates are ISO 8601 (GitHub's native format, no conversion needed).
 */

/**
 * Flatten a GitHub issue response to 13 essential fields.
 *
 * Extracts: id, number, state, state_reason, title, body, user_login,
 * assignee_login, labels, comments, created_at, updated_at, closed_at
 */
export function flattenIssue(
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: raw.id,
    number: raw.number,
    state: raw.state,
    state_reason: raw.state_reason ?? null,
    title: raw.title,
    body: (raw.body as string) ?? '',
    user_login: (raw.user as Record<string, unknown> | null)?.login ?? null,
    assignee_login:
      (raw.assignee as Record<string, unknown> | null)?.login ?? null,
    labels: ((raw.labels as Array<Record<string, unknown>>) ?? []).map(
      (l) => l.name
    ),
    comments: raw.comments,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    closed_at: raw.closed_at ?? null,
  }
}

/**
 * Flatten a GitHub pull request response to 15 essential fields.
 *
 * Extracts: id, number, state, title, body, user_login, head_ref, head_sha,
 * base_ref, merged, mergeable, labels, created_at, updated_at, merged_at
 */
export function flattenPullRequest(
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: raw.id,
    number: raw.number,
    state: raw.state,
    title: raw.title,
    body: (raw.body as string) ?? '',
    user_login: (raw.user as Record<string, unknown> | null)?.login ?? null,
    head_ref: (raw.head as Record<string, unknown>)?.ref,
    head_sha: (raw.head as Record<string, unknown>)?.sha,
    base_ref: (raw.base as Record<string, unknown>)?.ref,
    merged: raw.merged as boolean,
    mergeable: raw.mergeable ?? null,
    labels: ((raw.labels as Array<Record<string, unknown>>) ?? []).map(
      (l) => l.name
    ),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    merged_at: raw.merged_at ?? null,
  }
}

/**
 * Flatten a GitHub repository response to 12 essential fields.
 *
 * Extracts: id, name, full_name, private, description, language,
 * default_branch, stargazers_count, forks_count, open_issues_count,
 * created_at, updated_at
 */
export function flattenRepository(
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: raw.id,
    name: raw.name,
    full_name: raw.full_name,
    private: raw.private,
    description: raw.description ?? null,
    language: raw.language ?? null,
    default_branch: raw.default_branch,
    stargazers_count: raw.stargazers_count,
    forks_count: raw.forks_count,
    open_issues_count: raw.open_issues_count,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}
