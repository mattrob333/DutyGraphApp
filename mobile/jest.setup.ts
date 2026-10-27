// Shared test setup: native modules that have no JS implementation under jest.
import { jest } from '@jest/globals';
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

