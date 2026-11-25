import { createPlaid } from './factory';
import { PlaidLinkOptions } from './types';

type MockHandler = {
  open: jest.Mock;
  submit: jest.Mock;
  exit: jest.Mock;
  destroy: jest.Mock;
};

const makeHandler = (): MockHandler => ({
  open: jest.fn(),
  submit: jest.fn(),
  exit: jest.fn(),
  destroy: jest.fn(),
});

describe('factory lifecycle regression coverage', () => {
  const originalPlaid = window.Plaid;

  beforeEach(() => {
    window.Plaid = {
      create: jest.fn(),
      createEmbedded: jest.fn(),
    };
  });

  afterEach(() => {
    window.Plaid = originalPlaid;
    jest.clearAllMocks();
  });

  const makeConfig = (overrides: Partial<PlaidLinkOptions> = {}) =>
    ({
      token: 'link-sandbox-test-token',
      onSuccess: jest.fn(),
      ...overrides,
    }) as PlaidLinkOptions;

  it('maps publicKey to key without mutating the caller options', () => {
    const config = makeConfig({
      publicKey: 'public-test-key',
      env: 'sandbox',
    } as Partial<PlaidLinkOptions>);
    const original = { ...config };
    const handler = makeHandler();
    const creator = jest.fn(() => handler as any);

    const instance = createPlaid(config, creator);

    expect(creator).toHaveBeenCalledTimes(1);
    expect(creator.mock.calls[0][0]).toEqual(
      expect.objectContaining({ key: 'public-test-key' })
    );
    expect(creator.mock.calls[0][0]).not.toHaveProperty('publicKey');
    expect(config).toEqual(original);
    instance.destroy();
  });

  it('keeps open state and exit callbacks isolated between instances', () => {
    const firstHandler = makeHandler();
    const secondHandler = makeHandler();
    const firstExit = jest.fn();
    const secondExit = jest.fn();
    let firstSdkConfig: any;
    let secondSdkConfig: any;

    const first = createPlaid(makeConfig(), config => {
      firstSdkConfig = config;
      return firstHandler as any;
    });
    const second = createPlaid(makeConfig(), config => {
      secondSdkConfig = config;
      return secondHandler as any;
    });

    first.open();
    first.exit(undefined, firstExit);
    expect(firstHandler.open).toHaveBeenCalledTimes(1);
    expect(firstHandler.exit).toHaveBeenCalledTimes(1);
    expect(secondHandler.open).not.toHaveBeenCalled();
    expect(secondHandler.exit).not.toHaveBeenCalled();

    second.open();
    second.exit(undefined, secondExit);
    expect(secondHandler.open).toHaveBeenCalledTimes(1);
    expect(secondHandler.exit).toHaveBeenCalledTimes(1);

    firstSdkConfig.onExit(null, {});
    expect(firstExit).toHaveBeenCalledTimes(1);
    expect(secondExit).not.toHaveBeenCalled();

    secondSdkConfig.onExit(null, {});
    expect(secondExit).toHaveBeenCalledTimes(1);
    first.destroy();
    second.destroy();
  });

  it('destroys a handler at most once and makes subsequent operations safe', () => {
    const handler = makeHandler();
    const instance = createPlaid(makeConfig(), () => handler as any);

    instance.destroy();
    instance.destroy();
    instance.open();
    instance.submit({ phone_number: '+14155550123' });

    expect(handler.destroy).toHaveBeenCalledTimes(1);
    expect(handler.open).not.toHaveBeenCalled();
    expect(handler.submit).not.toHaveBeenCalled();
  });

  it('runs an exit callback immediately when the Link instance is not open', () => {
    const handler = makeHandler();
    const callback = jest.fn();
    const instance = createPlaid(makeConfig(), () => handler as any);

    instance.exit({ force: true }, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(handler.exit).not.toHaveBeenCalled();
    instance.destroy();
  });

  it('forwards the success token and metadata to the configured callback', () => {
    const handler = makeHandler();
    const onSuccess = jest.fn();
    let sdkConfig: any;
    const instance = createPlaid(makeConfig({ onSuccess }), config => {
      sdkConfig = config;
      return handler as any;
    });
    const metadata = { institution: { name: 'Test Bank' } };

    sdkConfig.onSuccess('public-sandbox-token', metadata);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('public-sandbox-token', metadata);
    instance.destroy();
  });
});
