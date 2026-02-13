import { describe, it, expect, vi } from 'vitest'
import { FeelrError } from '@feelr/connector-sdk'
import type { ActionContext, ActionResult } from '@feelr/connector-sdk'
import { issuesList } from '../actions/issues-list'
import { issuesGet } from '../actions/issues-get'
import { issuesCreate } from '../actions/issues-create'
import { pullsMerge } from '../actions/pulls-merge'
import { reposList } from '../actions/repos-list'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const rateLimitHeaders = (): Record<string, string> => ({
  'x-ratelimit-remaining': '4999',
  'x-ratelimit-limit': '5000',
  'x-ratelimit-used': '1',
  'x-ratelimit-reset': '1700000000',
})

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const allHeaders = { ...rateLimitHeaders(), ...headers }
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers(allHeaders),
  })
}

/** Build a mock ActionContext with a fetch spy returning the given response */
function makeCtx(
  params: Record<string, unknown>,
  response: Response,
  opts?: { credential?: string; cursor?: string }
): ActionContext {
  return {
    params,
    fetch: vi.fn().mockResolvedValue(response) as unknown as typeof globalThis.fetch,
    credential: opts?.credential ?? 'ghp_test_token',
    cursor: opts?.cursor,
  }
}

// ---------------------------------------------------------------------------
// Sample GitHub API fixtures
// ---------------------------------------------------------------------------

const sampleGitHubIssue = (n: number, pullRequest = false) => ({
  id: 100 + n,
  number: n,
  state: 'open',
  state_reason: null,
  title: `Issue ${n}`,
  body: `Body of issue ${n}`,
  user: { login: 'octocat', id: 1 },
  assignee: null,
  labels: [{ id: 1, name: 'bug', color: 'fc2929' }],
  comments: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  closed_at: null,
  url: 'https://api.github.com/repos/o/r/issues/' + n,
  ...(pullRequest ? { pull_request: { url: 'https://api.github.com/repos/o/r/pulls/' + n } } : {}),
})

const sampleGitHubMergeResult = {
  sha: 'abc123',
  merged: true,
  message: 'Pull Request successfully merged',
}

const sampleGitHubRepo = (n: number) => ({
  id: 200 + n,
  name: `repo-${n}`,
  full_name: `owner/repo-${n}`,
  private: false,
  description: `Repo ${n} description`,
  language: 'TypeScript',
  default_branch: 'main',
  stargazers_count: n * 10,
  forks_count: n,
  open_issues_count: n,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  html_url: `https://github.com/owner/repo-${n}`,
  clone_url: `https://github.com/owner/repo-${n}.git`,
  size: 1024,
})

// ---------------------------------------------------------------------------
// issues.list
// ---------------------------------------------------------------------------

describe('issues.list', () => {
  it('filters out pull requests and returns flattened issues', async () => {
    const githubResponse = [
      sampleGitHubIssue(1),
      sampleGitHubIssue(2, true), // This is a PR, should be filtered
      sampleGitHubIssue(3),
    ]
    const ctx = makeCtx(
      { repo: 'owner/repo', state: 'open', sort: 'created', per_page: 30 },
      mockResponse(githubResponse)
    )

    const result = await issuesList.handler(ctx)

    // Should have filtered out the PR (item 2)
    expect(result.data).toHaveLength(2)
    // Verify flattened shape has 13 keys
    expect(Object.keys((result.data as Record<string, unknown>[])[0])).toHaveLength(13)
  })

  it('passes pagination cursor as page param', async () => {
    const ctx = makeCtx(
      { repo: 'owner/repo', state: 'open', sort: 'created', per_page: 30 },
      mockResponse([]),
      { cursor: '3' }
    )

    await issuesList.handler(ctx)

    const fetchCall = (ctx.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain('page=3')
  })

  it('populates raw with full unfiltered GitHub response array', async () => {
    const githubResponse = [
      sampleGitHubIssue(1),
      sampleGitHubIssue(2, true), // PR - should be in raw but NOT in data
    ]
    const ctx = makeCtx(
      { repo: 'owner/repo', state: 'open', sort: 'created', per_page: 30 },
      mockResponse(githubResponse)
    )

    const result = await issuesList.handler(ctx)

    // raw includes ALL items (even the PR)
    expect(result.raw).toHaveLength(2)
    // data has the PR filtered out
    expect(result.data).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// issues.get
// ---------------------------------------------------------------------------

describe('issues.get', () => {
  it('returns a single flattened issue with raw field', async () => {
    const issue = sampleGitHubIssue(42)
    const ctx = makeCtx(
      { repo: 'owner/repo', issue_number: 42 },
      mockResponse(issue)
    )

    const result = await issuesGet.handler(ctx)

    // Data is a single flattened object
    expect(result.data).not.toBeInstanceOf(Array)
    expect((result.data as Record<string, unknown>).number).toBe(42)
    expect(Object.keys(result.data)).toHaveLength(13)

    // Raw is the full GitHub object
    expect(result.raw).toEqual(issue)
  })

  it('throws VALIDATION_ERROR when issue_number is missing', async () => {
    const ctx = makeCtx(
      { repo: 'owner/repo' },
      mockResponse({})
    )

    try {
      await issuesGet.handler(ctx)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      expect((err as FeelrError).code).toBe('VALIDATION_ERROR')
      expect((err as FeelrError).status).toBe(400)
    }
  })
})

// ---------------------------------------------------------------------------
// issues.create
// ---------------------------------------------------------------------------

describe('issues.create', () => {
  it('splits comma-separated labels and sends in POST body', async () => {
    const createdIssue = {
      ...sampleGitHubIssue(99),
      title: 'New Issue',
      labels: [{ id: 1, name: 'bug' }, { id: 2, name: 'enhancement' }],
    }
    const ctx = makeCtx(
      { repo: 'owner/repo', title: 'New Issue', labels: 'bug, enhancement', body: 'Issue body' },
      mockResponse(createdIssue)
    )

    const result = await issuesCreate.handler(ctx)

    // Verify POST body contains split labels
    const fetchCall = (ctx.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const init = fetchCall[1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.labels).toEqual(['bug', 'enhancement'])
    expect(body.title).toBe('New Issue')

    // Result has raw field
    expect(result.raw).toBeDefined()
    expect(result.raw).toEqual(createdIssue)
  })

  it('throws VALIDATION_ERROR when title is missing', async () => {
    const ctx = makeCtx(
      { repo: 'owner/repo' },
      mockResponse({})
    )

    try {
      await issuesCreate.handler(ctx)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      expect((err as FeelrError).code).toBe('VALIDATION_ERROR')
    }
  })
})

// ---------------------------------------------------------------------------
// pulls.merge
// ---------------------------------------------------------------------------

describe('pulls.merge', () => {
  it('returns merged/sha/message (not flattened PR) with raw field', async () => {
    const ctx = makeCtx(
      { repo: 'owner/repo', pull_number: 10, merge_method: 'squash' },
      mockResponse(sampleGitHubMergeResult)
    )

    const result = await pullsMerge.handler(ctx)

    expect(result.data).toEqual({
      merged: true,
      sha: 'abc123',
      message: 'Pull Request successfully merged',
    })

    // Raw is the full GitHub merge response
    expect(result.raw).toEqual(sampleGitHubMergeResult)
  })

  it('throws VALIDATION_ERROR when pull_number is missing', async () => {
    const ctx = makeCtx(
      { repo: 'owner/repo' },
      mockResponse({})
    )

    try {
      await pullsMerge.handler(ctx)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      expect((err as FeelrError).code).toBe('VALIDATION_ERROR')
    }
  })
})

// ---------------------------------------------------------------------------
// repos.list
// ---------------------------------------------------------------------------

describe('repos.list', () => {
  it('calls /user/repos (no owner/repo param) with raw field', async () => {
    const repos = [sampleGitHubRepo(1), sampleGitHubRepo(2)]
    const ctx = makeCtx(
      { type: 'all', sort: 'created', per_page: 30 },
      mockResponse(repos)
    )

    const result = await reposList.handler(ctx)

    // Verify correct API path
    const fetchCall = (ctx.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain('/user/repos')

    // Verify flattened data
    expect(result.data).toHaveLength(2)
    expect(Object.keys((result.data as Record<string, unknown>[])[0])).toHaveLength(12)

    // Raw field is the full GitHub response
    expect(result.raw).toEqual(repos)
  })
})

// ---------------------------------------------------------------------------
// Credential check (cross-cutting)
// ---------------------------------------------------------------------------

describe('credential check', () => {
  it('throws AUTH_REQUIRED (401) when credential is missing', async () => {
    const ctx = makeCtx(
      { repo: 'owner/repo', state: 'open', sort: 'created', per_page: 30 },
      mockResponse([]),
      { credential: undefined }
    )
    // Remove credential explicitly
    ctx.credential = undefined

    try {
      await issuesList.handler(ctx)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      const fe = err as FeelrError
      expect(fe.code).toBe('AUTH_REQUIRED')
      expect(fe.status).toBe(401)
      expect(fe.hint).toBe('auth')
    }
  })
})

// ---------------------------------------------------------------------------
// Repo validation (cross-cutting)
// ---------------------------------------------------------------------------

describe('repo validation', () => {
  it('throws VALIDATION_ERROR (400) for invalid repo format', async () => {
    const ctx = makeCtx(
      { repo: 'invalid-format', state: 'open', sort: 'created', per_page: 30 },
      mockResponse([])
    )

    try {
      await issuesList.handler(ctx)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      const fe = err as FeelrError
      expect(fe.code).toBe('VALIDATION_ERROR')
      expect(fe.status).toBe(400)
      expect(fe.hint).toBe('abort')
    }
  })
})

// ---------------------------------------------------------------------------
// Raw field contract
// ---------------------------------------------------------------------------

describe('raw field contract', () => {
  it('raw is defined on all action results', async () => {
    // Test issues.get
    const issueCtx = makeCtx(
      { repo: 'owner/repo', issue_number: 1 },
      mockResponse(sampleGitHubIssue(1))
    )
    const issueResult = await issuesGet.handler(issueCtx)
    expect(issueResult.raw).toBeDefined()

    // Test repos.list
    const reposCtx = makeCtx(
      { type: 'all', sort: 'created', per_page: 30 },
      mockResponse([sampleGitHubRepo(1)])
    )
    const reposResult = await reposList.handler(reposCtx)
    expect(reposResult.raw).toBeDefined()
  })

  it('raw differs from data (raw is original, data is flattened)', async () => {
    const originalIssue = sampleGitHubIssue(42)
    const ctx = makeCtx(
      { repo: 'owner/repo', issue_number: 42 },
      mockResponse(originalIssue)
    )

    const result = await issuesGet.handler(ctx)

    // raw should have keys like 'url', 'html_url' that are NOT in flattened data
    const rawObj = result.raw as Record<string, unknown>
    const dataObj = result.data as Record<string, unknown>
    expect(rawObj.url).toBeDefined()
    expect(dataObj.url).toBeUndefined()
    expect(rawObj.user).toEqual({ login: 'octocat', id: 1 })
    expect(dataObj.user_login).toBe('octocat')
  })

  it('raw preserves original nested structure', async () => {
    const originalIssue = sampleGitHubIssue(1)
    const ctx = makeCtx(
      { repo: 'owner/repo', issue_number: 1 },
      mockResponse(originalIssue)
    )

    const result = await issuesGet.handler(ctx)

    // raw preserves original nested user object
    const rawObj = result.raw as Record<string, unknown>
    expect(rawObj.user).toEqual({ login: 'octocat', id: 1 })
    // Data has flattened user_login
    expect((result.data as Record<string, unknown>).user_login).toBe('octocat')
    expect((result.data as Record<string, unknown>).user).toBeUndefined()
  })
})
