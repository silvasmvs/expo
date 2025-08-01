import { vol } from 'memfs';
import path from 'path';

import { resolveGradlePropertyAsync } from '../../platforms/android';
import {
  findGradleAndManifestAsync,
  parsePackageNameAsync,
  resolveDependencyConfigImplAndroidAsync,
} from '../androidResolver';
import { loadConfigAsync } from '../config';
import { resolveDependencyConfigImplIosAsync } from '../iosResolver';
import {
  createReactNativeConfigAsync,
  findDependencyRootsAsync,
  resolveAppProjectConfigAsync,
  resolveDependencyConfigAsync,
  resolveEdgeToEdgeDependencyRoot,
} from '../reactNativeConfig';
import type {
  RNConfigReactNativeLibraryConfig,
  RNConfigReactNativeProjectConfig,
} from '../reactNativeConfig.types';

jest.mock('fs/promises');
jest.mock('resolve-from');
jest.mock('../../platforms/android');
jest.mock('../androidResolver');
jest.mock('../iosResolver');
jest.mock('../config');

const EXPO_MONOREPO_ROOT = path.resolve(__dirname, '../../../../..');

describe(createReactNativeConfigAsync, () => {
  const mockPlatformResolverIos = resolveDependencyConfigImplIosAsync as jest.MockedFunction<
    typeof resolveDependencyConfigImplIosAsync
  >;

  afterEach(() => {
    vol.reset();
  });

  it('should return config', async () => {
    const packageJson = {
      name: 'test',
      version: '1.0.0',
      dependencies: {
        'react-native': '0.0.1',
        'react-native-test': '~0.0.2',
      },
      devDependencies: {
        '@react-native/subtest': '^2.0.0',
      },
    };

    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/node_modules/react-native/package.json': '',
      '/app/node_modules/react-native-test/package.json': '',
      '/app/node_modules/@react-native/subtest/package.json': '',
    });
    mockPlatformResolverIos.mockImplementationOnce(async (packageRoot, reactNativeConfig) => {
      if (packageRoot.endsWith('react-native-test')) {
        return {
          podspecPath: '/app/node_modules/react-native-test/RNTest.podspec',
          version: '1.0.0',
          configurations: [],
          scriptPhases: [],
        };
      }
      return null;
    });
    const result = await createReactNativeConfigAsync({
      platform: 'ios',
      projectRoot: '/app',
      searchPaths: ['/app/node_modules'],
      transitiveLinkingDependencies: [],
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "dependencies": {
          "react-native-test": {
            "name": "react-native-test",
            "platforms": {
              "ios": {
                "configurations": [],
                "podspecPath": "/app/node_modules/react-native-test/RNTest.podspec",
                "scriptPhases": [],
                "version": "1.0.0",
              },
            },
            "root": "/app/node_modules/react-native-test",
          },
        },
        "project": {
          "ios": {
            "sourceDir": "/app/ios",
          },
        },
        "reactNativePath": "/app/node_modules/react-native",
        "root": "/app",
      }
    `);
  });

  it('should return config with local dependencies', async () => {
    const packageJson = {
      name: 'test',
      version: '1.0.0',
      dependencies: {
        'react-native': '0.0.1',
      },
    };
    const projectConfig: RNConfigReactNativeProjectConfig = {
      dependencies: {
        'react-native-test': {
          root: '/app/modules/react-native-test',
        },
      },
    };
    const mockLoadReactNativeConfigAsync = loadConfigAsync as jest.MockedFunction<
      typeof loadConfigAsync
    >;
    mockLoadReactNativeConfigAsync.mockResolvedValueOnce(projectConfig);

    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/modules/react-native-test/package.json': '',
      '/app/node_modules/react-native/package.json': '',
    });
    mockPlatformResolverIos.mockImplementationOnce(async (packageRoot, reactNativeConfig) => {
      if (packageRoot.endsWith('react-native-test')) {
        return {
          podspecPath: '/app/modules/react-native-test/RNTest.podspec',
          version: '1.0.0',
          configurations: [],
          scriptPhases: [],
        };
      }
      return null;
    });
    const result = await createReactNativeConfigAsync({
      platform: 'ios',
      projectRoot: '/app',
      searchPaths: ['/app/node_modules'],
      transitiveLinkingDependencies: [],
    });
    expect(result.dependencies['react-native-test']).toBeDefined();
    expect(result.dependencies['react-native-test'].root).toBe('/app/modules/react-native-test');
  });

  it('should return config if local dependencies are not specified', async () => {
    const packageJson = {
      name: 'test',
      version: '1.0.0',
      dependencies: {
        'react-native': '0.0.1',
      },
    };
    const projectConfig: RNConfigReactNativeProjectConfig = {};
    const mockLoadReactNativeConfigAsync = loadConfigAsync as jest.MockedFunction<
      typeof loadConfigAsync
    >;
    mockLoadReactNativeConfigAsync.mockResolvedValueOnce(projectConfig);

    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/node_modules/react-native/package.json': '',
    });
    const result = await createReactNativeConfigAsync({
      platform: 'ios',
      projectRoot: '/app',
      searchPaths: ['/app/node_modules'],
      transitiveLinkingDependencies: [],
    });
    expect(result).toBeDefined();
  });
});

describe('createReactNativeConfigAsync with react-native-edge-to-edge', () => {
  const mockPlatformResolverAndroid =
    resolveDependencyConfigImplAndroidAsync as jest.MockedFunction<
      typeof resolveDependencyConfigImplAndroidAsync
    >;
  const mockPlatformResolverIos = resolveDependencyConfigImplIosAsync as jest.MockedFunction<
    typeof resolveDependencyConfigImplIosAsync
  >;

  const mockFindGradleAndManifestAsync = findGradleAndManifestAsync as jest.MockedFunction<
    typeof findGradleAndManifestAsync
  >;
  mockFindGradleAndManifestAsync.mockResolvedValue({
    gradle: 'app/build.gradle',
    manifest: 'src/main/AndroidManifest.xml',
  });
  const mockParsePackageNameAsync = parsePackageNameAsync as jest.MockedFunction<
    typeof parsePackageNameAsync
  >;
  mockParsePackageNameAsync.mockResolvedValue('com.test');

  const mockResolveGradlePropertyAsync = resolveGradlePropertyAsync as jest.MockedFunction<
    typeof resolveGradlePropertyAsync
  >;

  afterEach(() => {
    vol.reset();
    mockPlatformResolverAndroid.mockReset();
    mockPlatformResolverIos.mockReset();
  });

  it('should resolve react-native-edge-to-edge when gradle property `expo.edgeToEdgeEnabled` is true', async () => {
    const packageJson = {
      name: 'test',
      version: '1.0.0',
      dependencies: {
        expo: '*',
      },
    };
    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/node_modules/react-native-edge-to-edge/package.json': '',
    });
    mockResolveGradlePropertyAsync.mockImplementationOnce(async (_, propertyKey) => {
      if (propertyKey === 'expo.edgeToEdgeEnabled') {
        return 'true';
      }
      return null;
    });
    await createReactNativeConfigAsync({
      platform: 'android',
      projectRoot: '/app',
      searchPaths: ['/app/node_modules'],
      transitiveLinkingDependencies: [],
    });
    expect(mockPlatformResolverAndroid).toHaveBeenCalledWith(
      '/app/node_modules/react-native-edge-to-edge',
      undefined
    );
  });

  it('should resolve react-native-edge-to-edge when transitiveLinkingDependencies includes react-native-edge-to-edge', async () => {
    const packageJson = {
      name: 'test',
      version: '1.0.0',
      dependencies: {
        expo: '*',
      },
    };
    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/node_modules/react-native-edge-to-edge/package.json': '',
    });
    await createReactNativeConfigAsync({
      platform: 'android',
      projectRoot: '/app',
      searchPaths: ['/app/node_modules'],
      transitiveLinkingDependencies: ['react-native-edge-to-edge'],
    });
    expect(mockPlatformResolverAndroid).toHaveBeenCalledWith(
      '/app/node_modules/react-native-edge-to-edge',
      undefined
    );
  });

  it('should not resolve react-native-edge-to-edge when gradle property `expo.edgeToEdgeEnabled` is not true', async () => {
    const packageJson = {
      name: 'test',
      version: '1.0.0',
      dependencies: {
        expo: '*',
      },
    };
    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/node_modules/react-native-edge-to-edge/package.json': '',
    });
    await createReactNativeConfigAsync({
      platform: 'android',
      projectRoot: '/app',
      searchPaths: ['/app/node_modules'],
      transitiveLinkingDependencies: [],
    });
    expect(mockPlatformResolverAndroid).not.toHaveBeenCalled();
  });

  it('should not resolve react-native-edge-to-edge when platform is ios', async () => {
    const packageJson = {
      name: 'test',
      version: '1.0.0',
      dependencies: {
        expo: '*',
      },
    };
    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/node_modules/react-native-edge-to-edge/package.json': '',
    });
    mockResolveGradlePropertyAsync.mockImplementationOnce(async (_, propertyKey) => {
      if (propertyKey === 'expo.edgeToEdgeEnabled') {
        return 'true';
      }
      return null;
    });
    await createReactNativeConfigAsync({
      platform: 'ios',
      projectRoot: '/app',
      searchPaths: ['/app/node_modules'],
      transitiveLinkingDependencies: [],
    });
    expect(mockPlatformResolverIos).not.toHaveBeenCalled();
  });
});

describe(findDependencyRootsAsync, () => {
  afterEach(() => {
    vol.reset();
  });

  it('should find all dependencies and devDependencies', async () => {
    const packageJson = {
      name: 'test',
      version: '1.0.0',
      dependencies: {
        'react-native': '0.0.1',
        'react-native-test': '~0.0.2',
      },
      devDependencies: {
        '@react-native/subtest': '^2.0.0',
      },
    };

    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/node_modules/react-native/package.json': '',
      '/app/node_modules/react-native-test/package.json': '',
      '/app/node_modules/@react-native/subtest/package.json': '',
    });
    const results = await findDependencyRootsAsync('/app', ['/app/node_modules']);
    expect(results).toMatchInlineSnapshot(`
      {
        "@react-native/subtest": "/app/node_modules/@react-native/subtest",
        "react-native": "/app/node_modules/react-native",
        "react-native-test": "/app/node_modules/react-native-test",
      }
    `);
  });

  it('should find all dependencies and devDependencies within hoisted monorepo', async () => {
    const packageJson = {
      name: 'test',
      version: '1.0.0',
      dependencies: {
        'react-native': '0.0.1',
        'react-native-test': '~0.0.2',
      },
      devDependencies: {
        '@react-native/subtest': '^2.0.0',
      },
    };

    vol.fromJSON({
      '/project/apps/app/package.json': JSON.stringify(packageJson),
      '/project/node_modules/react-native/package.json': '',
      '/project/node_modules/react-native-test/package.json': '',
      '/project/node_modules/@react-native/subtest/package.json': '',
    });
    const results = await findDependencyRootsAsync('/project/apps/app', [
      '/project/apps/app/node_modules',
      '/project/node_modules',
    ]);
    expect(results).toMatchInlineSnapshot(`
      {
        "@react-native/subtest": "/project/node_modules/@react-native/subtest",
        "react-native": "/project/node_modules/react-native",
        "react-native-test": "/project/node_modules/react-native-test",
      }
    `);
  });
});

describe(resolveEdgeToEdgeDependencyRoot, () => {
  beforeEach(() => {
    vol.reset();
  });
  it('should find edge-to-edge from expo package root', async () => {
    const packageJson = {
      dependencies: {
        expo: '53.0.0',
        'react-native-edge-to-edge': '^1.0.0',
      },
    };

    const expoPackageJson = {
      name: 'expo',
      version: '53.0.0',
    };

    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/node_modules/expo/package.json': JSON.stringify(expoPackageJson),
      '/app/node_modules/react-native-edge-to-edge/package.json': '', // Added just to make sure it doesn't resolve from this location
      '/app/node_modules/expo/node_modules/react-native-edge-to-edge/package.json': '{}',
    });

    const results = await resolveEdgeToEdgeDependencyRoot('/app');
    expect(results).toMatch('/app/node_modules/expo/node_modules/react-native-edge-to-edge');
  });

  it('should find edge-to-edge from project root if expo package not found', async () => {
    const packageJson = {
      dependencies: {
        expo: '53.0.0',
        'react-native-edge-to-edge': '^1.0.0',
      },
    };

    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
      '/app/node_modules/react-native-edge-to-edge/package.json': '',
    });

    const results = await resolveEdgeToEdgeDependencyRoot('/app');
    expect(results).toMatch('/app/node_modules/react-native-edge-to-edge');
  });

  it('should return an empty object if failed to resolve', async () => {
    const packageJson = {
      dependencies: {
        expo: '53.0.0',
        'react-native-edge-to-edge': '^1.0.0',
      },
    };

    vol.fromJSON({
      '/app/package.json': JSON.stringify(packageJson),
    });

    const results = await resolveEdgeToEdgeDependencyRoot('/app');
    expect(results).toBe(null);
  });
});

describe(resolveAppProjectConfigAsync, () => {
  it('should return app project config for android', async () => {
    const mockFindGradleAndManifestAsync = findGradleAndManifestAsync as jest.MockedFunction<
      typeof findGradleAndManifestAsync
    >;
    mockFindGradleAndManifestAsync.mockResolvedValueOnce({
      gradle: 'app/build.gradle',
      manifest: 'src/main/AndroidManifest.xml',
    });
    const mockParsePackageNameAsync = parsePackageNameAsync as jest.MockedFunction<
      typeof parsePackageNameAsync
    >;
    mockParsePackageNameAsync.mockResolvedValueOnce('com.test');
    const config = await resolveAppProjectConfigAsync('/app', 'android');
    expect(config).toMatchInlineSnapshot(`
      {
        "android": {
          "packageName": "com.test",
          "sourceDir": "/app/android",
        },
      }
    `);
  });

  it('should return empty project config for android if no gradle files or manifest files', async () => {
    const mockFindGradleAndManifestAsync = findGradleAndManifestAsync as jest.MockedFunction<
      typeof findGradleAndManifestAsync
    >;
    mockFindGradleAndManifestAsync.mockResolvedValueOnce({
      gradle: null,
      manifest: null,
    });
    const mockParsePackageNameAsync = parsePackageNameAsync as jest.MockedFunction<
      typeof parsePackageNameAsync
    >;
    mockParsePackageNameAsync.mockResolvedValueOnce('com.test');
    const config = await resolveAppProjectConfigAsync('/app', 'android');
    expect(config).toEqual({});
  });

  it('should return app project config for ios', async () => {
    const config = await resolveAppProjectConfigAsync('/app', 'ios');
    expect(config).toMatchInlineSnapshot(`
      {
        "ios": {
          "sourceDir": "/app/ios",
        },
      }
    `);
  });

  it('should return app project config with custom sourceDir', async () => {
    const mockFindGradleAndManifestAsync = findGradleAndManifestAsync as jest.MockedFunction<
      typeof findGradleAndManifestAsync
    >;
    mockFindGradleAndManifestAsync.mockResolvedValueOnce({
      gradle: 'app/build.gradle',
      manifest: 'src/main/AndroidManifest.xml',
    });
    const mockParsePackageNameAsync = parsePackageNameAsync as jest.MockedFunction<
      typeof parsePackageNameAsync
    >;
    mockParsePackageNameAsync.mockResolvedValueOnce('com.test');
    const configAndroid = await resolveAppProjectConfigAsync('/app', 'android', '/customNative');
    expect(configAndroid).toMatchInlineSnapshot(`
      {
        "android": {
          "packageName": "com.test",
          "sourceDir": "/customNative",
        },
      }
    `);

    const configIOS = await resolveAppProjectConfigAsync('/app', 'ios', '/customNative');
    expect(configIOS).toMatchInlineSnapshot(`
      {
        "ios": {
          "sourceDir": "/customNative",
        },
      }
    `);
  });
});

describe(resolveDependencyConfigAsync, () => {
  const mockLoadReactNativeConfigAsync = loadConfigAsync as jest.MockedFunction<
    typeof loadConfigAsync
  >;
  const mockPlatformResolverIos = resolveDependencyConfigImplIosAsync as jest.MockedFunction<
    typeof resolveDependencyConfigImplIosAsync
  >;

  it('should return config with platform config', async () => {
    mockPlatformResolverIos.mockResolvedValueOnce({
      podspecPath: '/app/node_modules/react-native-test/RNTest.podspec',
      version: '1.0.0',
      configurations: [],
      scriptPhases: [],
    });

    const result = await resolveDependencyConfigAsync(
      'ios',
      'react-native-test',
      '/app/node_modules/react-native-test',
      null
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "name": "react-native-test",
        "platforms": {
          "ios": {
            "configurations": [],
            "podspecPath": "/app/node_modules/react-native-test/RNTest.podspec",
            "scriptPhases": [],
            "version": "1.0.0",
          },
        },
        "root": "/app/node_modules/react-native-test",
      }
    `);
  });

  it('should call the platform resolver', async () => {
    await resolveDependencyConfigAsync(
      'ios',
      'react-native-test',
      '/app/node_modules/react-native-test',
      null
    );
    expect(mockPlatformResolverIos).toHaveBeenCalledWith(
      '/app/node_modules/react-native-test',
      undefined
    );
  });

  it('should call platform resolver with config from library', async () => {
    const libraryConfig: RNConfigReactNativeLibraryConfig = {
      dependency: {
        platforms: {
          ios: {
            configurations: ['Debug'],
            scriptPhases: [{ name: 'test', path: './test.js' }],
          },
        },
      },
    };
    mockLoadReactNativeConfigAsync.mockResolvedValueOnce(libraryConfig);

    await resolveDependencyConfigAsync(
      'ios',
      'react-native-test',
      '/app/node_modules/react-native-test',
      null
    );
    expect(mockPlatformResolverIos).toHaveBeenCalledWith('/app/node_modules/react-native-test', {
      configurations: ['Debug'],
      scriptPhases: [{ name: 'test', path: './test.js' }],
    });
  });

  it('should call platform resolver with merged config and project config will override library config', async () => {
    const projectConfig: RNConfigReactNativeProjectConfig = {
      dependencies: {
        'react-native-test': {
          platforms: {
            ios: null,
          },
        },
      },
    };
    const libraryConfig: RNConfigReactNativeLibraryConfig = {
      dependency: {
        platforms: {
          ios: {
            configurations: ['Debug'],
            scriptPhases: [{ name: 'test', path: './test.js' }],
          },
        },
      },
    };
    mockLoadReactNativeConfigAsync.mockResolvedValueOnce(libraryConfig);

    await resolveDependencyConfigAsync(
      'ios',
      'react-native-test',
      '/app/node_modules/react-native-test',
      projectConfig
    );
    expect(mockPlatformResolverIos).toHaveBeenCalledWith(
      '/app/node_modules/react-native-test',
      null
    );
  });

  it(`should return null for the react-native because it's a platform package`, async () => {
    const actualResolveFrom = jest.requireActual('resolve-from');
    const reactNativeRoot = path.dirname(
      actualResolveFrom(EXPO_MONOREPO_ROOT, 'react-native/package.json')
    );
    const result = await resolveDependencyConfigAsync('ios', 'react-native', reactNativeRoot, null);
    expect(result).toBe(null);
  });
});
