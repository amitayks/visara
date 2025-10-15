import Foundation
import React

/**
 * Native module for iOS memory monitoring
 *
 * Provides accurate memory usage information using iOS's task_info APIs.
 * This enables the app to monitor memory usage in real-time and implement
 * throttling when memory is above threshold (80%).
 *
 * Constitutional Alignment:
 * - Performance & Optimization Standards: Memory monitoring and overflow prevention
 * - Target: <200MB baseline, <500MB during processing
 */
@objc(MemoryModule)
class MemoryModule: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /**
   * Get current memory information
   *
   * Returns:
   * - totalMemory: Total physical memory (in bytes)
   * - usedMemory: Memory currently used by the app (in bytes)
   * - freeMemory: Available memory (in bytes)
   * - footprint: Memory footprint of the app (in bytes)
   * - available: Available physical memory (in bytes)
   */
  @objc
  func getMemoryInfo(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      // Get app's memory usage
      var taskInfo = task_vm_info_data_t()
      var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size) / 4

      let result = withUnsafeMutablePointer(to: &taskInfo) { taskInfoPointer in
        taskInfoPointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { intPtr in
          task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), intPtr, &count)
        }
      }

      if result != KERN_SUCCESS {
        reject("ERROR", "Failed to get task info", nil)
        return
      }

      // App's memory usage (footprint)
      let usedMemory = taskInfo.phys_footprint

      // Get system memory info
      let physicalMemory = ProcessInfo.processInfo.physicalMemory

      // Get available memory
      var vmStats = vm_statistics64()
      var vmStatsSize = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)

      let vmResult = withUnsafeMutablePointer(to: &vmStats) { vmStatsPointer in
        vmStatsPointer.withMemoryRebound(to: integer_t.self, capacity: Int(vmStatsSize)) { intPtr in
          host_statistics64(mach_host_self(), HOST_VM_INFO64, intPtr, &vmStatsSize)
        }
      }

      var freeMemory: UInt64 = 0
      if vmResult == KERN_SUCCESS {
        let pageSize = UInt64(vm_kernel_page_size)
        freeMemory = UInt64(vmStats.free_count) * pageSize
      }

      // Prepare result
      let memoryInfo: [String: Any] = [
        "totalMemory": physicalMemory,
        "usedMemory": usedMemory,
        "freeMemory": freeMemory,
        "footprint": usedMemory,
        "available": freeMemory
      ]

      resolve(memoryInfo)
    } catch {
      reject("ERROR", "Failed to get memory info: \(error.localizedDescription)", error)
    }
  }

  /**
   * Request garbage collection
   * Note: Swift has automatic memory management, but we can trigger autoreleasepool drain
   */
  @objc
  func requestGC(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    autoreleasepool {
      // Drain autoreleasepool
      resolve(true)
    }
  }
}
