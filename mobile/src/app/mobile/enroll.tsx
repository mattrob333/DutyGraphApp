import React, { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { LoadingState } from '@/components/common';
import { buildEnrollUrl } from '@/features/auth/enrollErrors';

/** HTTPS App Link target: /mobile/enroll?t=<token> on the selected approved host; hands off to /invite. */
export default function EnrollLink() {
  const params = useLocalSearchParams<{ t?: string | string[] }>();
  const t = (Array.isArray(params.t) ? params.t[0] : params.t)?.trim();

  useEffect(() => {
    if (t) router.replace({ pathname: '/invite', params: { t, url: buildEnrollUrl(t) } });
    else router.replace('/invite');
  }, [t]);

  return <LoadingState label="Opening your invitation…" />;
}
