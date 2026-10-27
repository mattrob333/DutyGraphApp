import { configure } from '@testing-library/react-native';

// Suites run in parallel workers; give async queries headroom on busy CI machines.
configure({ asyncUtilTimeout: 5000 });
