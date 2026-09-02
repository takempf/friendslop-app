import { describe, it, expect } from "vitest";
import {
  parseDualSenseReport,
  isDualSenseDevice,
  DUALSENSE_VENDOR_ID,
  DUALSENSE_PRODUCT_ID,
  DUALSENSE_EDGE_PRODUCT_ID,
  DUALSENSE_LSB_TO_RAD_S,
} from "./dualsenseReport";

describe("dualsenseReport", () => {
  it("identifies DualSense and DualSense Edge vendor and product IDs", () => {
    expect(isDualSenseDevice(DUALSENSE_VENDOR_ID, DUALSENSE_PRODUCT_ID)).toBe(
      true,
    );
    expect(
      isDualSenseDevice(DUALSENSE_VENDOR_ID, DUALSENSE_EDGE_PRODUCT_ID),
    ).toBe(true);
    expect(isDualSenseDevice(DUALSENSE_VENDOR_ID)).toBe(true);
    expect(isDualSenseDevice(0x045e, 0x02ea)).toBe(false); // Xbox
    expect(isDualSenseDevice(0x057e, 0x2009)).toBe(false); // Switch Pro
  });

  it("parses USB Report 0x01 correctly", () => {
    const view = new DataView(new ArrayBuffer(64));

    view.setUint8(4, 200); // L2 trigger
    view.setUint8(5, 255); // R2 trigger

    view.setInt16(15, 1000, true); // pitch
    view.setInt16(17, -2000, true); // yaw

    view.setUint8(52, 0x18); // capacity 8 (80%), status 1 (charging)

    const report = parseDualSenseReport(0x01, view);

    expect(report.valid).toBe(true);
    expect(report.reportType).toBe("usb");
    expect(report.triggerL2).toBe(200);
    expect(report.triggerR2).toBe(255);
    expect(report.gyroPitch).toBe(1000);
    expect(report.gyroYaw).toBe(-2000);
    expect(report.batteryLevel).toBe(80);
    expect(report.isCharging).toBe(true);
  });

  it("parses Bluetooth Report 0x31 with every offset shifted by one", () => {
    const view = new DataView(new ArrayBuffer(78));

    view.setUint8(5, 128); // L2
    view.setUint8(6, 64); // R2

    view.setInt16(16, -1500, true); // pitch
    view.setInt16(18, 3000, true); // yaw

    view.setUint8(53, 0x0a); // capacity 10 (100%), status 0 (discharging)

    const report = parseDualSenseReport(0x31, view);

    expect(report.valid).toBe(true);
    expect(report.reportType).toBe("bluetooth");
    expect(report.triggerL2).toBe(128);
    expect(report.triggerR2).toBe(64);
    expect(report.gyroPitch).toBe(-1500);
    expect(report.gyroYaw).toBe(3000);
    expect(report.batteryLevel).toBe(100);
    expect(report.isCharging).toBe(false);
  });

  it("converts gyro counts to a known angular rate", () => {
    // Full positive scale is +2000 deg/s by definition of the sensor range.
    const view = new DataView(new ArrayBuffer(64));
    view.setInt16(15, 32767, true);

    const report = parseDualSenseReport(0x01, view);
    const degPerSec =
      report.gyroPitch * DUALSENSE_LSB_TO_RAD_S * (180 / Math.PI);

    expect(degPerSec).toBeCloseTo(2000, 0);
  });

  it("handles negative int16 boundaries properly", () => {
    const view = new DataView(new ArrayBuffer(64));

    view.setInt16(15, -32768, true);
    view.setInt16(17, 32767, true);

    const report = parseDualSenseReport(0x01, view);
    expect(report.gyroPitch).toBe(-32768);
    expect(report.gyroYaw).toBe(32767);
  });

  it("reads only the charge-status nibble, not the capacity bits", () => {
    const view = new DataView(new ArrayBuffer(64));

    // Capacity 8 with status 0: the 0x08 capacity bit must not read as charging.
    view.setUint8(52, 0x08);
    expect(parseDualSenseReport(0x01, view).isCharging).toBe(false);

    // Status 2 is "charge complete", which is not charging either.
    view.setUint8(52, 0x28);
    expect(parseDualSenseReport(0x01, view).isCharging).toBe(false);

    view.setUint8(52, 0x18);
    expect(parseDualSenseReport(0x01, view).isCharging).toBe(true);
  });

  it("omits battery when the payload stops short of the battery byte", () => {
    const view = new DataView(new ArrayBuffer(24));
    const report = parseDualSenseReport(0x01, view);

    expect(report.valid).toBe(true);
    expect(report.batteryLevel).toBeNull();
    expect(report.isCharging).toBe(false);
  });

  it("falls back to payload size for unnumbered (report ID 0) reports", () => {
    const bluetooth = new DataView(new ArrayBuffer(78));
    bluetooth.setInt16(16, 777, true);
    expect(parseDualSenseReport(0, bluetooth).reportType).toBe("bluetooth");
    expect(parseDualSenseReport(0, bluetooth).gyroPitch).toBe(777);

    const usb = new DataView(new ArrayBuffer(64));
    usb.setInt16(15, 555, true);
    expect(parseDualSenseReport(0, usb).reportType).toBe("usb");
    expect(parseDualSenseReport(0, usb).gyroPitch).toBe(555);
  });

  it("returns invalid report for unsupported report IDs or short byte lengths", () => {
    const short = new DataView(new ArrayBuffer(10));

    expect(parseDualSenseReport(0x01, short).valid).toBe(false);
    expect(parseDualSenseReport(0x31, short).valid).toBe(false);
    expect(
      parseDualSenseReport(0x99, new DataView(new ArrayBuffer(64))).valid,
    ).toBe(false);
  });
});
