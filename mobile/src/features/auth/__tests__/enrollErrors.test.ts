import { describe, expect, it } from '@jest/globals';
import { CompanionApiError } from '@/types/domain';
import { buildEnrollUrl, describeEnrollError, isSafeBrowserUrl } from '../enrollErrors';

describe('enrollErrors', () => {
  it('maps expired and web-link errors', () => {
    expect(describeEnrollError(new CompanionApiError('INVITATION_EXPIRED', 'x', 410, false)).kind).toBe('expired');
    expect(describeEnrollError(new CompanionApiError('USE_WEB_LINK', 'x', 409, false)).kind).toBe('useWeb');
    expect(describeEnrollError(new Error('boom')).kind).toBe('other');
  });
  it('builds and validates urls', () => {
    expect(buildEnrollUrl('a b')).toBe('https://respond.dutygraph.com/mobile/enroll?t=a%20b');
    expect(isSafeBrowserUrl('https://respond.dutygraph.com/mobile/enroll?t=x')).toBe(true);
    expect(isSafeBrowserUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeBrowserUrl('dutygraph-companion://x')).toBe(false);
  });
});
