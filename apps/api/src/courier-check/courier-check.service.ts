import { Injectable, Logger } from '@nestjs/common';
import { COURIER_CHECK_CONFIG } from './courier-check.config.js';

export interface CourierCheckResult {
  total: number;
  success: number;
  cancel: number;
  successRate: number;
  cancelRate: number;
}

@Injectable()
export class CourierCheckService {
  private readonly logger = new Logger(CourierCheckService.name);

  async checkPhone(phoneNumber: string): Promise<CourierCheckResult | null> {
    const { baseUrl, apiKey, userName, password, useSandbox } =
      COURIER_CHECK_CONFIG;
// 🚀 ১. সার্ভিসটি যে কল হয়েছে তা দেখার জন্য
    this.logger.log(`Checking courier history for phone: ${phoneNumber}`);
    if (!apiKey) {
      this.logger.warn('Courier check skipped: FRAUDBD_API_KEY not configured');
      return null;
    }

    if (!useSandbox && (!userName || !password)) {
      this.logger.warn(
        'Courier check skipped: production mode requires FRAUDBD_USERNAME/FRAUDBD_PASSWORD',
      );
      return null;
    }

    const endpoint = useSandbox
      ? '/api/sandbox/check-courier-info'
      : '/api/check-courier-info';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      api_key: apiKey,
    };

    if (!useSandbox) {
      headers.user_name = userName;
      headers.password = password;
    }

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone_number: phoneNumber }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.logger.warn(`Courier check API returned ${response.status}`);
        return null;
      }

      const json = await response.json();

      if (!json.status || !json.data?.totalSummary) {
        return null;
      }

      return json.data.totalSummary as CourierCheckResult;
    } catch (error) {
      this.logger.error('Courier check failed', error);
      return null;
    }
  }
}