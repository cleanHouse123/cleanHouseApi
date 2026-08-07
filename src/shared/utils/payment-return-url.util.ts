import { joinUrl } from './url.util';

const MOBILE_RETURN_PROTOCOLS = new Set(['cleanhousemobile:']);

type PaymentReturnUrlParams = {
  frontendUrl: string;
  fallbackPath: string;
  paymentId: string;
  type: 'order' | 'subscription';
  returnUrl?: string;
  extraParams?: Record<string, string | undefined>;
};

const getAllowedWebOrigin = (frontendUrl: string) => {
  try {
    return new URL(frontendUrl).origin;
  } catch {
    return null;
  }
};

const getSafeReturnUrl = (returnUrl: string | undefined, frontendUrl: string) => {
  if (!returnUrl) return null;

  try {
    const url = new URL(returnUrl);
    const allowedWebOrigin = getAllowedWebOrigin(frontendUrl);

    if (
      allowedWebOrigin &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === allowedWebOrigin
    ) {
      return url;
    }

    if (MOBILE_RETURN_PROTOCOLS.has(url.protocol)) {
      return url;
    }
  } catch {
    return null;
  }

  return null;
};

export const buildPaymentReturnUrl = ({
  frontendUrl,
  fallbackPath,
  paymentId,
  type,
  returnUrl,
  extraParams,
}: PaymentReturnUrlParams) => {
  const fallbackUrl = new URL(joinUrl(frontendUrl, fallbackPath));
  const url = getSafeReturnUrl(returnUrl, frontendUrl) ?? fallbackUrl;

  url.searchParams.set('paymentId', paymentId);
  url.searchParams.set('type', type);

  Object.entries(extraParams ?? {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
};
