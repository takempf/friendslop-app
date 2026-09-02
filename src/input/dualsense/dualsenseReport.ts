export const DUALSENSE_VENDOR_ID = 0x054c;
export const DUALSENSE_PRODUCT_ID = 0x0ce6;
export const DUALSENSE_EDGE_PRODUCT_ID = 0x0df2;

/** Gyro full-scale range is ±2000 deg/s spread across the int16 range. */
export const DUALSENSE_LSB_TO_RAD_S = (Math.PI / 180) * (2000 / 32768);

export type DualSenseReportType = "usb" | "bluetooth";

const USB_REPORT_ID = 0x01;
const BLUETOOTH_REPORT_ID = 0x31;

/**
 * Some platforms deliver DualSense reports unnumbered (report ID 0). The two
 * layouts are then only distinguishable by payload size: the Bluetooth report
 * is 77 bytes, the USB one 63.
 */
const BLUETOOTH_MIN_PAYLOAD = 77;

interface ReportLayout {
  /** Shortest payload that still contains the gyro block. */
  readonly minLength: number;
  readonly l2: number;
  readonly r2: number;
  /** First byte of the gyro block: pitch, yaw, roll as consecutive int16 LE. */
  readonly gyro: number;
  readonly battery: number;
}

/**
 * Byte offsets into the WebHID `DataView`, which excludes the leading report-ID
 * byte. The Bluetooth report carries one extra header byte ahead of the payload,
 * so every offset shifts by +1 from the USB report.
 */
const LAYOUTS: Record<DualSenseReportType, ReportLayout> = {
  usb: { minLength: 21, l2: 4, r2: 5, gyro: 15, battery: 52 },
  bluetooth: { minLength: 22, l2: 5, r2: 6, gyro: 16, battery: 53 },
};

interface DualSenseReportFields {
  /** Raw int16 counts. Scale with DUALSENSE_LSB_TO_RAD_S *after* removing bias. */
  readonly gyroPitch: number;
  readonly gyroYaw: number;
  /** 0-255 analog trigger travel. */
  readonly triggerL2: number;
  readonly triggerR2: number;
  readonly batteryLevel: number | null;
  readonly isCharging: boolean;
}

/** Discriminated on `valid`, so a validity check narrows `reportType` too. */
export type DualSenseParsedReport = DualSenseReportFields &
  (
    | { readonly valid: true; readonly reportType: DualSenseReportType }
    | { readonly valid: false; readonly reportType: "unknown" }
  );

const INVALID_REPORT: DualSenseParsedReport = {
  valid: false,
  reportType: "unknown",
  gyroPitch: 0,
  gyroYaw: 0,
  triggerL2: 0,
  triggerR2: 0,
  batteryLevel: null,
  isCharging: false,
};

export function isDualSenseDevice(
  vendorId: number,
  productId?: number,
): boolean {
  if (vendorId !== DUALSENSE_VENDOR_ID) return false;
  if (productId === undefined) return true;
  return (
    productId === DUALSENSE_PRODUCT_ID ||
    productId === DUALSENSE_EDGE_PRODUCT_ID
  );
}

function selectReportType(
  reportId: number,
  byteLength: number,
): DualSenseReportType | null {
  const type: DualSenseReportType | null =
    reportId === BLUETOOTH_REPORT_ID
      ? "bluetooth"
      : reportId === USB_REPORT_ID
        ? "usb"
        : reportId === 0
          ? byteLength >= BLUETOOTH_MIN_PAYLOAD
            ? "bluetooth"
            : "usb"
          : null;

  if (type === null) return null;
  return byteLength >= LAYOUTS[type].minLength ? type : null;
}

/**
 * Low nibble is capacity in 10% steps (0-10); high nibble is charge status,
 * where 1 means charging.
 */
function readBattery(
  data: DataView,
  offset: number,
): Pick<DualSenseParsedReport, "batteryLevel" | "isCharging"> {
  if (data.byteLength <= offset) {
    return { batteryLevel: null, isCharging: false };
  }
  const byte = data.getUint8(offset);
  return {
    batteryLevel: Math.min(100, (byte & 0x0f) * 10),
    isCharging: ((byte >> 4) & 0x0f) === 1,
  };
}

export function parseDualSenseReport(
  reportId: number,
  data: DataView,
): DualSenseParsedReport {
  const reportType = selectReportType(reportId, data.byteLength);
  if (reportType === null) return INVALID_REPORT;

  const layout = LAYOUTS[reportType];

  return {
    valid: true,
    reportType,
    gyroPitch: data.getInt16(layout.gyro, true),
    gyroYaw: data.getInt16(layout.gyro + 2, true),
    triggerL2: data.getUint8(layout.l2),
    triggerR2: data.getUint8(layout.r2),
    ...readBattery(data, layout.battery),
  };
}
