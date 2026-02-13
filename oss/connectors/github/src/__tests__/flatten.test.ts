import { describe, it, expect } from 'vitest'
import { flattenIssue, flattenPullRequest, flattenRepository } from '../flatten'

// ---------------------------------------------------------------------------
// Realistic GitHub API response fixtures
// ---------------------------------------------------------------------------

const sampleIssue: Record<string, unknown> = {
  id: 123456,
  number: 42,
  state: 'open',
  state_reason: null,
  title: 'Fix the bug',
  body: 'This is the issue body with **markdown**.',
  user: { login: 'octocat', id: 1, avatar_url: 'https://avatars.github.com/u/1' },
  assignee: { login: 'assignee-user', id: 2, avatar_url: 'https://avatars.github.com/u/2' },
  labels: [
    { id: 1, name: 'bug', color: 'fc2929', description: 'Bug label' },
    { id: 2, name: 'priority', color: '0e8a16', description: 'Priority label' },
  ],
  comments: 5,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-16T12:30:00Z',
  closed_at: null,
  // Extra fields GitHub returns that should NOT appear in flattened output
  url: 'https://api.github.com/repos/owner/repo/issues/42',
  html_url: 'https://github.com/owner/repo/issues/42',
  repository_url: 'https://api.github.com/repos/owner/repo',
  events_url: 'https://api.github.com/repos/owner/repo/issues/42/events',
  milestone: null,
}

const samplePullRequest: Record<string, unknown> = {
  id: 789012,
  number: 99,
  state: 'open',
  title: 'Add new feature',
  body: 'PR description here.',
  user: { login: 'contributor', id: 3 },
  head: { ref: 'feature-branch', sha: 'abc123def456', repo: { full_name: 'contributor/repo' } },
  base: { ref: 'main', sha: 'def789ghi012', repo: { full_name: 'owner/repo' } },
  merged: false,
  mergeable: true,
  labels: [
    { id: 3, name: 'enhancement', color: '84b6eb' },
  ],
  created_at: '2024-02-01T08:00:00Z',
  updated_at: '2024-02-02T14:00:00Z',
  merged_at: null,
  // Extra fields
  diff_url: 'https://github.com/owner/repo/pull/99.diff',
  patch_url: 'https://github.com/owner/repo/pull/99.patch',
  commits: 3,
  additions: 150,
  deletions: 30,
  changed_files: 5,
}

const sampleRepository: Record<string, unknown> = {
  id: 345678,
  name: 'my-repo',
  full_name: 'owner/my-repo',
  private: false,
  description: 'A sample repository for testing.',
  language: 'TypeScript',
  default_branch: 'main',
  stargazers_count: 42,
  forks_count: 12,
  open_issues_count: 7,
  created_at: '2023-06-01T00:00:00Z',
  updated_at: '2024-01-20T18:00:00Z',
  // Extra fields
  html_url: 'https://github.com/owner/my-repo',
  clone_url: 'https://github.com/owner/my-repo.git',
  size: 1024,
  watchers_count: 42,
  topics: ['typescript', 'api'],
  owner: { login: 'owner', id: 1 },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('flattenIssue', () => {
  it('extracts exactly 13 keys from a realistic issue', () => {
    const flat = flattenIssue(sampleIssue)
    expect(Object.keys(flat)).toHaveLength(13)
  })

  it('extracts all expected fields correctly', () => {
    const flat = flattenIssue(sampleIssue)
    expect(flat).toEqual({
      id: 123456,
      number: 42,
      state: 'open',
      state_reason: null,
      title: 'Fix the bug',
      body: 'This is the issue body with **markdown**.',
      user_login: 'octocat',
      assignee_login: 'assignee-user',
      labels: ['bug', 'priority'],
      comments: 5,
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-16T12:30:00Z',
      closed_at: null,
    })
  })

  it('handles null user and assignee', () => {
    const issue = { ...sampleIssue, user: null, assignee: null }
    const flat = flattenIssue(issue)
    expect(flat.user_login).toBeNull()
    expect(flat.assignee_login).toBeNull()
  })

  it('handles empty labels array', () => {
    const issue = { ...sampleIssue, labels: [] }
    const flat = flattenIssue(issue)
    expect(flat.labels).toEqual([])
  })

  it('handles all nullable fields absent', () => {
    const issue: Record<string, unknown> = {
      id: 1,
      number: 1,
      state: 'open',
      title: 'Minimal',
      body: null,
      user: null,
      assignee: null,
      labels: null,
      comments: 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    const flat = flattenIssue(issue)
    expect(flat.state_reason).toBeNull()
    expect(flat.body).toBe('')
    expect(flat.user_login).toBeNull()
    expect(flat.assignee_login).toBeNull()
    expect(flat.labels).toEqual([])
    expect(flat.closed_at).toBeNull()
  })
})

describe('flattenPullRequest', () => {
  it('extracts exactly 15 keys from a realistic pull request', () => {
    const flat = flattenPullRequest(samplePullRequest)
    expect(Object.keys(flat)).toHaveLength(15)
  })

  it('extracts all expected fields correctly', () => {
    const flat = flattenPullRequest(samplePullRequest)
    expect(flat).toEqual({
      id: 789012,
      number: 99,
      state: 'open',
      title: 'Add new feature',
      body: 'PR description here.',
      user_login: 'contributor',
      head_ref: 'feature-branch',
      head_sha: 'abc123def456',
      base_ref: 'main',
      merged: false,
      mergeable: true,
      labels: ['enhancement'],
      created_at: '2024-02-01T08:00:00Z',
      updated_at: '2024-02-02T14:00:00Z',
      merged_at: null,
    })
  })

  it('handles merged PR with merged_at set', () => {
    const pr = {
      ...samplePullRequest,
      state: 'closed',
      merged: true,
      merged_at: '2024-02-03T10:00:00Z',
    }
    const flat = flattenPullRequest(pr)
    expect(flat.merged).toBe(true)
    expect(flat.merged_at).toBe('2024-02-03T10:00:00Z')
  })

  it('handles null user', () => {
    const pr = { ...samplePullRequest, user: null }
    const flat = flattenPullRequest(pr)
    expect(flat.user_login).toBeNull()
  })
})

describe('flattenRepository', () => {
  it('extracts exactly 12 keys from a realistic repository', () => {
    const flat = flattenRepository(sampleRepository)
    expect(Object.keys(flat)).toHaveLength(12)
  })

  it('extracts all expected fields correctly', () => {
    const flat = flattenRepository(sampleRepository)
    expect(flat).toEqual({
      id: 345678,
      name: 'my-repo',
      full_name: 'owner/my-repo',
      private: false,
      description: 'A sample repository for testing.',
      language: 'TypeScript',
      default_branch: 'main',
      stargazers_count: 42,
      forks_count: 12,
      open_issues_count: 7,
      created_at: '2023-06-01T00:00:00Z',
      updated_at: '2024-01-20T18:00:00Z',
    })
  })

  it('handles nullable description and language', () => {
    const repo = { ...sampleRepository, description: undefined, language: undefined }
    const flat = flattenRepository(repo)
    expect(flat.description).toBeNull()
    expect(flat.language).toBeNull()
  })

  it('handles private repository', () => {
    const repo = { ...sampleRepository, private: true }
    const flat = flattenRepository(repo)
    expect(flat.private).toBe(true)
  })
})
