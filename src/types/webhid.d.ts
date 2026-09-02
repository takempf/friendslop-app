interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDeviceRequestOptions {
  filters: readonly HIDDeviceFilter[];
  exclusionFilters?: readonly HIDDeviceFilter[];
}

export interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice;
  readonly reportId: number;
  readonly data: DataView;
}

export interface HIDDeviceEvent extends Event {
  readonly device: HIDDevice;
}

export interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: readonly unknown[];
  open(): Promise<void>;
  close(): Promise<void>;
  forget?(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  addEventListener(
    type: "inputreport",
    listener: (event: HIDInputReportEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "inputreport",
    listener: (event: HIDInputReportEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

export interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
  addEventListener(
    type: "connect" | "disconnect",
    listener: (event: HIDDeviceEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "connect" | "disconnect",
    listener: (event: HIDDeviceEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

declare global {
  interface Navigator {
    readonly hid?: HID;
  }
}
