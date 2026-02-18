/**
 * @feelr/connector-github
 *
 * GitHub connector for Feelr. Implements 10 actions covering
 * issues (list, get, create, update, close), pull requests
 * (list, get, create, merge), and repositories (list).
 *
 * Auth: bearer_token (GitHub Personal Access Token)
 * All actions use the shared githubFetch helper for consistent
 * error mapping, pagination, and rate limit extraction.
 */
import type { ConnectorDefinition } from '@feelr/connector-sdk'

import { issuesList } from './actions/issues-list'
import { issuesGet } from './actions/issues-get'
import { issuesCreate } from './actions/issues-create'
import { issuesUpdate } from './actions/issues-update'
import { issuesClose } from './actions/issues-close'
import { pullsList } from './actions/pulls-list'
import { pullsGet } from './actions/pulls-get'
import { pullsCreate } from './actions/pulls-create'
import { pullsMerge } from './actions/pulls-merge'
import { reposList } from './actions/repos-list'

export const githubConnector: ConnectorDefinition = {
  name: 'github',
  display_name: 'GitHub',
  version: '0.1.0',
  auth_type: 'bearer_token',
  actions: {
    'issues.list': issuesList,
    'issues.get': issuesGet,
    'issues.create': issuesCreate,
    'issues.update': issuesUpdate,
    'issues.close': issuesClose,
    'pulls.list': pullsList,
    'pulls.get': pullsGet,
    'pulls.create': pullsCreate,
    'pulls.merge': pullsMerge,
    'repos.list': reposList,
  },
}
