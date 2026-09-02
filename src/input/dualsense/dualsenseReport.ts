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
  /** First of four stick bytes: left X/Y then right X/Y, 0-255 with 128 centred. */
  readonly sticks: number;
  readonly l2: number;
  readonly r2: number;
  /** Face/d-pad byte; the next one holds the shoulder, stick, and menu buttons. */
  readonly buttons: number;
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
  usb: { minLength: 21, sticks: 0, l2: 4, r2: 5, buttons: 7, gyro: 15, battery: 52 }, // prettier-ignore
  bluetooth: { minLength: 22, sticks: 1, l2: 5, r2: 6, buttons: 8, gyro: 16, battery: 53 }, // prettier-ignore
};

/**
 * Standard-mapping button indices, so a parsed report can be sampled by the
 * same code that samples a Gamepad API pad.
 */
export const PAD_BUTTON = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  create: 8,
  options: 9,
  l3: 10,
  r3: 11,
  ps: 16,
} as const;

/** Bit positions within the two DualSense button bytes. */
const FACE_BITS: ReadonlyArray<readonly [number, number]> = [
  [4, PAD_BUTTON.square],
  [5, PAD_BUTTON.cross],
  [6, PAD_BUTTON.circle],
  [7, PAD_BUTTON.triangle],
];

const SHOULDER_BITS: ReadonlyArray<readonly [number, number]> = [
  [0, PAD_BUTTON.l1],
  [1, PAD_BUTTON.r1],
  [4, PAD_BUTTON.create],
  [5, PAD_BUTTON.options],
  [6, PAD_BUTTON.l3],
  [7, PAD_BUTTON.r3],
];

/** 0-255 with 128 at rest becomes -1..1, matching the Gamepad API's axes. */
function normalizeStick(raw: number): number {
  return Math.max(-1, Math.min(1, (raw - 128) / 127));
}

interface DualSenseReportFields {
  /** Left X/Y then right X/Y, in Gamepad API orientation and range. */
  readonly axes: readonly number[];
  /** 0..1 per standard-mapping button index; triggers keep analog travel. */
  readonly buttons: readonly number[];
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
  axes: [0, 0, 0, 0],
  buttons: [],
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

  const triggerL2 = data.getUint8(layout.l2);
  const triggerR2 = data.getUint8(layout.r2);

  const buttons: number[] = [];
  const face = data.getUint8(layout.buttons);
  const shoulder = data.getUint8(layout.buttons + 1);
  for (const [bit, index] of FACE_BITS) {
    buttons[index] = (face >> bit) & 1;
  }
  for (const [bit, index] of SHOULDER_BITS) {
    buttons[index] = (shoulder >> bit) & 1;
  }
  buttons[PAD_BUTTON.l2] = triggerL2 / 255;
  buttons[PAD_BUTTON.r2] = triggerR2 / 255;

  return {
    valid: true,
    reportType,
    axes: [
      normalizeStick(data.getUint8(layout.sticks)),
      normalizeStick(data.getUint8(layout.sticks + 1)),
      normalizeStick(data.getUint8(layout.sticks + 2)),
      normalizeStick(data.getUint8(layout.sticks + 3)),
    ],
    buttons,
    gyroPitch: data.getInt16(layout.gyro, true),
    gyroYaw: data.getInt16(layout.gyro + 2, true),
    triggerL2,
    triggerR2,
    ...readBattery(data, layout.battery),
  };
}
