import { Injectable, Logger } from '@nestjs/common';
import { CourierCheckService } from '../courier-check/courier-check.service.js';
import { db } from '../prisma/db.js';
import { RISK_THRESHOLDS } from './risk.config.js';

export interface RiskAssessment {
  level: 'NONE' | 'MEDIUM' | 'HIGH';
  reasons: string[];
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    private readonly courierCheckService: CourierCheckService,
  ) {}

  async assessOrderRisk(
    organizationId: number,
    customerId: number,
    grandTotal: number,
  ): Promise<RiskAssessment> {
    const reasons: string[] = [];

    try {
      const customer = await db.orm.public.Customer
        .where({ id: customerId, organizationId })
        .first();

      if (customer) {
        const ageMs = Date.now() - new Date(customer.createdAt).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        if (
          ageDays < RISK_THRESHOLDS.newCustomerMaxAgeDays &&
          grandTotal > RISK_THRESHOLDS.newCustomerHighValueAmount
        ) {
          reasons.push(
            `New customer (${ageDays.toFixed(1)}d old) placing high-value order (${grandTotal})`,
          );
        }
      }

      if (grandTotal > RISK_THRESHOLDS.hugeOrderAmount) {
        reasons.push(`Order value ${grandTotal} exceeds huge-order threshold`);
      }

      const lookbackDate = new Date(
        Date.now() -
          RISK_THRESHOLDS.cancellationLookbackDays * 24 * 60 * 60 * 1000,
      );

      const pastOrders = await db.orm.public.Order
        .where({ organizationId, customerId })
        .all();

      const badHistoryCount = pastOrders.filter(
        (o) =>
          (o.status === 'CANCELLED' || o.status === 'RETURNED') &&
          new Date(o.createdAt) >= lookbackDate,
      ).length;

      if (badHistoryCount >= RISK_THRESHOLDS.cancellationCountThreshold) {
        reasons.push(
          `${badHistoryCount} cancelled/returned orders in last ${RISK_THRESHOLDS.cancellationLookbackDays} days`,
        );
      }

      // Courier-wide history (Steadfast/Pathao/Paperfly/RedX aggregated via FraudBD)
      if (customer?.phone) {
        const courierResult = await this.courierCheckService.checkPhone(
          customer.phone,
        );

        if (
          courierResult &&
          courierResult.total >= RISK_THRESHOLDS.courierMinOrdersForSignal &&
          courierResult.cancelRate >= RISK_THRESHOLDS.courierCancelRateThreshold
        ) {
          reasons.push(
            `Courier history: ${courierResult.cancelRate}% cancel rate across ${courierResult.total} orders (all couriers)`,
          );
        }
      }
    } catch (error) {
      // Risk assessment must never block order creation.
      this.logger.error('Risk assessment failed, defaulting to NONE', error);
      return { level: 'NONE', reasons: [] };
    }

    const level =
      reasons.length >= 2 ? 'HIGH' : reasons.length === 1 ? 'MEDIUM' : 'NONE';

    return { level, reasons };
  }
}