import { Redirect } from 'expo-router';
import { useSessionStore } from '@/state/session';

export default function Index() {
  const status = useSessionStore((s) => s.status);
  return <Redirect href={status === 'signedIn' ? '/today' : '/invite'} />;
}
