(module
  ;; HelloNewApp - MyNewAp1Claude Companion WASM Module
  ;; Provides utility functions for the AI platform

  ;; Import WASI functions for I/O
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit"
    (func $proc_exit (param i32)))

  ;; Memory (1 page = 64KB)
  (memory (export "memory") 1)

  ;; Data section - strings
  (data (i32.const 0) "HelloNewApp v1.0.0 - MyNewAp1Claude Companion\n")
  (data (i32.const 48) "Ready for AI operations!\n")

  ;; Global variables
  (global $heap_ptr (mut i32) (i32.const 256))

  ;; ============================================
  ;; Exported Functions
  ;; ============================================

  ;; Main entry point (WASI _start)
  (func (export "_start")
    ;; Print welcome message
    (call $print_welcome)
    ;; Exit successfully
    (call $proc_exit (i32.const 0))
  )

  ;; Print welcome message
  (func $print_welcome
    ;; Set up iovec for fd_write
    ;; iovec[0].buf = pointer to string
    (i32.store (i32.const 100) (i32.const 0))
    ;; iovec[0].len = length of string (46 bytes)
    (i32.store (i32.const 104) (i32.const 46))

    ;; fd_write(fd=1, iovs=100, iovs_len=1, nwritten=108)
    (drop (call $fd_write
      (i32.const 1)    ;; stdout
      (i32.const 100)  ;; iovec pointer
      (i32.const 1)    ;; iovec count
      (i32.const 108)  ;; nwritten pointer
    ))

    ;; Print ready message
    (i32.store (i32.const 100) (i32.const 48))
    (i32.store (i32.const 104) (i32.const 25))
    (drop (call $fd_write
      (i32.const 1)
      (i32.const 100)
      (i32.const 1)
      (i32.const 108)
    ))
  )

  ;; Add two numbers (utility function)
  (func (export "add") (param $a i32) (param $b i32) (result i32)
    (i32.add (local.get $a) (local.get $b))
  )

  ;; Multiply two numbers
  (func (export "multiply") (param $a i32) (param $b i32) (result i32)
    (i32.mul (local.get $a) (local.get $b))
  )

  ;; Calculate simple hash (djb2 algorithm for a single i32)
  (func (export "hash_i32") (param $value i32) (result i32)
    (local $hash i32)
    (local.set $hash (i32.const 5381))

    ;; hash = hash * 33 + byte1
    (local.set $hash
      (i32.add
        (i32.mul (local.get $hash) (i32.const 33))
        (i32.and (local.get $value) (i32.const 255))
      )
    )
    ;; hash = hash * 33 + byte2
    (local.set $hash
      (i32.add
        (i32.mul (local.get $hash) (i32.const 33))
        (i32.and (i32.shr_u (local.get $value) (i32.const 8)) (i32.const 255))
      )
    )
    ;; hash = hash * 33 + byte3
    (local.set $hash
      (i32.add
        (i32.mul (local.get $hash) (i32.const 33))
        (i32.and (i32.shr_u (local.get $value) (i32.const 16)) (i32.const 255))
      )
    )
    ;; hash = hash * 33 + byte4
    (local.set $hash
      (i32.add
        (i32.mul (local.get $hash) (i32.const 33))
        (i32.shr_u (local.get $value) (i32.const 24))
      )
    )

    (local.get $hash)
  )

  ;; Clamp value between min and max
  (func (export "clamp") (param $value i32) (param $min i32) (param $max i32) (result i32)
    (if (result i32) (i32.lt_s (local.get $value) (local.get $min))
      (then (local.get $min))
      (else
        (if (result i32) (i32.gt_s (local.get $value) (local.get $max))
          (then (local.get $max))
          (else (local.get $value))
        )
      )
    )
  )

  ;; Check if value is in valid temperature range (0-200, representing 0.0-2.0)
  (func (export "is_valid_temperature") (param $temp_x100 i32) (result i32)
    (i32.and
      (i32.ge_s (local.get $temp_x100) (i32.const 0))
      (i32.le_s (local.get $temp_x100) (i32.const 200))
    )
  )

  ;; Get version (returns 100 for v1.0.0)
  (func (export "get_version") (result i32)
    (i32.const 100)
  )

  ;; Allocate memory (simple bump allocator)
  (func (export "alloc") (param $size i32) (result i32)
    (local $ptr i32)
    (local.set $ptr (global.get $heap_ptr))
    (global.set $heap_ptr (i32.add (global.get $heap_ptr) (local.get $size)))
    (local.get $ptr)
  )

  ;; Get memory pointer for reading/writing
  (func (export "get_memory_ptr") (result i32)
    (i32.const 256)  ;; Start of usable memory
  )
)
