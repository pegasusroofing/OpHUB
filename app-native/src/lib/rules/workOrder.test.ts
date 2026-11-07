/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseWorkOrder } from './workOrder.ts';

test('work order: number, address over two lines, description stopping at the next label', () => {
  const rows = [
    'Work Order: WO-12345 Workstream Repairs Client: Sanctuary',
    'Repair Description: Leak above bedroom window, check flashing Version: 2',
    'Property: 14 HIGH STREET',
    'CHELMSFORD CM3 8DQ',
    'Resident: Mrs Smith Tel: 01245 000000',
  ];
  // The resident (tenant) is read too (Andy, 7 Nov 2026), stopping at the next label (Tel:).
  assert.deepEqual(parseWorkOrder(rows), { jobNumber: 'WO-12345', address: '14 High Street Chelmsford CM3 8DQ', description: 'Leak above bedroom window, check flashing', tenant: 'Mrs Smith' });
  assert.deepEqual(parseWorkOrder([...rows.slice(0, 4), 'Resident: Mr K Hughes', 'Resident Phone: 07700 900456']).tenantPhone, '07700 900456');
  assert.deepEqual(parseWorkOrder(['nothing useful']), {});
});
