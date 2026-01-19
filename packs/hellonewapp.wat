(module
  ;; HelloNewApp v1.3.0 - MyNewAp1Claude Utility Pack
  ;; Features: Fibonacci, Prime checker, Factorial, GCD, Random numbers

  ;; Import WASI functions for I/O
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit"
    (func $proc_exit (param i32)))

  ;; Memory (1 page = 64KB)
  (memory (export "memory") 1)

  ;; Data section - strings
  (data (i32.const 0) "=== HelloNewApp v1.3.0 ===\n")
  (data (i32.const 28) "Utility Pack for MyNewAp1Claude\n\n")
  (data (i32.const 62) "[Fibonacci Demo]\n")
  (data (i32.const 80) "fib(10) = ")
  (data (i32.const 91) "\n")
  (data (i32.const 93) "[Prime Check Demo]\n")
  (data (i32.const 113) "is_prime(17) = ")
  (data (i32.const 129) "YES")
  (data (i32.const 133) "NO ")
  (data (i32.const 137) "\n")
  (data (i32.const 139) "is_prime(18) = ")
  (data (i32.const 155) "[Factorial Demo]\n")
  (data (i32.const 173) "fact(7) = ")
  (data (i32.const 184) "[GCD Demo]\n")
  (data (i32.const 196) "gcd(48, 18) = ")
  (data (i32.const 211) "[Random Demo]\n")
  (data (i32.const 226) "random() = ")
  (data (i32.const 238) "\n\n=== Execution Complete ===\n")
  ;; Number buffer at offset 300

  ;; Global variables
  (global $heap_ptr (mut i32) (i32.const 512))
  (global $random_seed (mut i32) (i32.const 12345))

  ;; ============================================
  ;; Main Entry Point
  ;; ============================================
  (func (export "_start")
    (call $run_demo)
    (call $proc_exit (i32.const 0))
  )

  ;; Run full demo
  (func $run_demo
    ;; Header
    (call $print_str (i32.const 0) (i32.const 27))    ;; === HelloNewApp v1.3.0 ===
    (call $print_str (i32.const 28) (i32.const 33))   ;; Utility Pack...

    ;; Fibonacci Demo
    (call $print_str (i32.const 62) (i32.const 17))   ;; [Fibonacci Demo]
    (call $print_str (i32.const 80) (i32.const 10))   ;; fib(10) =
    (call $print_number (call $fibonacci (i32.const 10)))
    (call $print_str (i32.const 91) (i32.const 1))    ;; newline

    ;; Prime Check Demo
    (call $print_str (i32.const 93) (i32.const 19))   ;; [Prime Check Demo]
    (call $print_str (i32.const 113) (i32.const 15))  ;; is_prime(17) =
    (if (call $is_prime (i32.const 17))
      (then (call $print_str (i32.const 129) (i32.const 3)))  ;; YES
      (else (call $print_str (i32.const 133) (i32.const 3)))  ;; NO
    )
    (call $print_str (i32.const 137) (i32.const 1))   ;; newline
    (call $print_str (i32.const 139) (i32.const 15))  ;; is_prime(18) =
    (if (call $is_prime (i32.const 18))
      (then (call $print_str (i32.const 129) (i32.const 3)))  ;; YES
      (else (call $print_str (i32.const 133) (i32.const 3)))  ;; NO
    )
    (call $print_str (i32.const 137) (i32.const 1))   ;; newline

    ;; Factorial Demo
    (call $print_str (i32.const 155) (i32.const 17))  ;; [Factorial Demo]
    (call $print_str (i32.const 173) (i32.const 10))  ;; fact(7) =
    (call $print_number (call $factorial (i32.const 7)))
    (call $print_str (i32.const 91) (i32.const 1))    ;; newline

    ;; GCD Demo
    (call $print_str (i32.const 184) (i32.const 11))  ;; [GCD Demo]
    (call $print_str (i32.const 196) (i32.const 14))  ;; gcd(48, 18) =
    (call $print_number (call $gcd (i32.const 48) (i32.const 18)))
    (call $print_str (i32.const 91) (i32.const 1))    ;; newline

    ;; Random Demo
    (call $print_str (i32.const 211) (i32.const 14))  ;; [Random Demo]
    (call $print_str (i32.const 226) (i32.const 11))  ;; random() =
    (call $print_number (call $random))
    (call $print_str (i32.const 91) (i32.const 1))    ;; newline

    ;; Footer
    (call $print_str (i32.const 238) (i32.const 29))  ;; === Execution Complete ===
  )

  ;; ============================================
  ;; Utility Functions (Exported)
  ;; ============================================

  ;; Calculate Fibonacci number
  (func (export "fibonacci") (param $n i32) (result i32)
    (call $fibonacci (local.get $n))
  )

  (func $fibonacci (param $n i32) (result i32)
    (local $a i32)
    (local $b i32)
    (local $temp i32)
    (local $i i32)

    (if (result i32) (i32.le_s (local.get $n) (i32.const 1))
      (then (local.get $n))
      (else
        (local.set $a (i32.const 0))
        (local.set $b (i32.const 1))
        (local.set $i (i32.const 2))

        (block $break
          (loop $loop
            (br_if $break (i32.gt_s (local.get $i) (local.get $n)))
            (local.set $temp (i32.add (local.get $a) (local.get $b)))
            (local.set $a (local.get $b))
            (local.set $b (local.get $temp))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $loop)
          )
        )
        (local.get $b)
      )
    )
  )

  ;; Check if number is prime
  (func (export "is_prime") (param $n i32) (result i32)
    (call $is_prime (local.get $n))
  )

  (func $is_prime (param $n i32) (result i32)
    (local $i i32)

    ;; Numbers less than 2 are not prime
    (if (i32.lt_s (local.get $n) (i32.const 2))
      (then (return (i32.const 0)))
    )

    ;; 2 is prime
    (if (i32.eq (local.get $n) (i32.const 2))
      (then (return (i32.const 1)))
    )

    ;; Even numbers are not prime
    (if (i32.eqz (i32.rem_s (local.get $n) (i32.const 2)))
      (then (return (i32.const 0)))
    )

    ;; Check odd divisors up to sqrt(n)
    (local.set $i (i32.const 3))
    (block $break
      (loop $loop
        ;; If i*i > n, we're done (it's prime)
        (br_if $break (i32.gt_s (i32.mul (local.get $i) (local.get $i)) (local.get $n)))

        ;; If n is divisible by i, not prime
        (if (i32.eqz (i32.rem_s (local.get $n) (local.get $i)))
          (then (return (i32.const 0)))
        )

        (local.set $i (i32.add (local.get $i) (i32.const 2)))
        (br $loop)
      )
    )

    (i32.const 1)
  )

  ;; Calculate factorial
  (func (export "factorial") (param $n i32) (result i32)
    (call $factorial (local.get $n))
  )

  (func $factorial (param $n i32) (result i32)
    (local $result i32)
    (local $i i32)

    (if (result i32) (i32.le_s (local.get $n) (i32.const 1))
      (then (i32.const 1))
      (else
        (local.set $result (i32.const 1))
        (local.set $i (i32.const 2))

        (block $break
          (loop $loop
            (br_if $break (i32.gt_s (local.get $i) (local.get $n)))
            (local.set $result (i32.mul (local.get $result) (local.get $i)))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $loop)
          )
        )
        (local.get $result)
      )
    )
  )

  ;; Calculate GCD (Greatest Common Divisor) using Euclidean algorithm
  (func (export "gcd") (param $a i32) (param $b i32) (result i32)
    (call $gcd (local.get $a) (local.get $b))
  )

  (func $gcd (param $a i32) (param $b i32) (result i32)
    (local $temp i32)

    ;; Make sure a and b are positive
    (if (i32.lt_s (local.get $a) (i32.const 0))
      (then (local.set $a (i32.sub (i32.const 0) (local.get $a))))
    )
    (if (i32.lt_s (local.get $b) (i32.const 0))
      (then (local.set $b (i32.sub (i32.const 0) (local.get $b))))
    )

    ;; Euclidean algorithm
    (block $break
      (loop $loop
        (br_if $break (i32.eqz (local.get $b)))
        (local.set $temp (i32.rem_s (local.get $a) (local.get $b)))
        (local.set $a (local.get $b))
        (local.set $b (local.get $temp))
        (br $loop)
      )
    )

    (local.get $a)
  )

  ;; Generate pseudo-random number (Linear Congruential Generator)
  (func (export "random") (result i32)
    (call $random)
  )

  (func $random (result i32)
    ;; LCG: seed = (seed * 1103515245 + 12345) mod 2^31
    (global.set $random_seed
      (i32.and
        (i32.add
          (i32.mul (global.get $random_seed) (i32.const 1103515245))
          (i32.const 12345)
        )
        (i32.const 2147483647)
      )
    )
    (global.get $random_seed)
  )

  ;; Seed the random number generator
  (func (export "seed_random") (param $seed i32)
    (global.set $random_seed (local.get $seed))
  )

  ;; ============================================
  ;; Legacy Functions (kept for compatibility)
  ;; ============================================

  ;; Add two numbers
  (func (export "add") (param $a i32) (param $b i32) (result i32)
    (i32.add (local.get $a) (local.get $b))
  )

  ;; Multiply two numbers
  (func (export "multiply") (param $a i32) (param $b i32) (result i32)
    (i32.mul (local.get $a) (local.get $b))
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

  ;; Get version (returns 130 for v1.3.0)
  (func (export "get_version") (result i32)
    (i32.const 130)
  )

  ;; ============================================
  ;; Internal Helper Functions
  ;; ============================================

  ;; Print a string from memory
  (func $print_str (param $ptr i32) (param $len i32)
    (i32.store (i32.const 400) (local.get $ptr))
    (i32.store (i32.const 404) (local.get $len))
    (drop (call $fd_write
      (i32.const 1)
      (i32.const 400)
      (i32.const 1)
      (i32.const 408)
    ))
  )

  ;; Print a number (converts i32 to decimal string)
  (func $print_number (param $num i32)
    (local $ptr i32)
    (local $len i32)
    (local $digit i32)
    (local $is_negative i32)

    ;; Start at end of buffer (offset 350)
    (local.set $ptr (i32.const 350))
    (local.set $len (i32.const 0))

    ;; Handle negative numbers
    (local.set $is_negative (i32.const 0))
    (if (i32.lt_s (local.get $num) (i32.const 0))
      (then
        (local.set $is_negative (i32.const 1))
        (local.set $num (i32.sub (i32.const 0) (local.get $num)))
      )
    )

    ;; Handle zero
    (if (i32.eqz (local.get $num))
      (then
        (i32.store8 (local.get $ptr) (i32.const 48))  ;; '0'
        (local.set $len (i32.const 1))
      )
      (else
        ;; Convert digits (stored in reverse)
        (block $break
          (loop $loop
            (br_if $break (i32.eqz (local.get $num)))
            (local.set $digit (i32.rem_u (local.get $num) (i32.const 10)))
            (i32.store8 (local.get $ptr) (i32.add (i32.const 48) (local.get $digit)))
            (local.set $ptr (i32.add (local.get $ptr) (i32.const 1)))
            (local.set $len (i32.add (local.get $len) (i32.const 1)))
            (local.set $num (i32.div_u (local.get $num) (i32.const 10)))
            (br $loop)
          )
        )

        ;; Add negative sign if needed
        (if (local.get $is_negative)
          (then
            (i32.store8 (local.get $ptr) (i32.const 45))  ;; '-'
            (local.set $len (i32.add (local.get $len) (i32.const 1)))
          )
        )

        ;; Reverse the string (copy to buffer at 300)
        (local.set $ptr (i32.sub (local.get $ptr) (i32.const 1)))
        (block $rev_break
          (loop $rev_loop
            (br_if $rev_break (i32.lt_s (local.get $ptr) (i32.const 350)))
            (i32.store8
              (i32.add (i32.const 300) (i32.sub (i32.const 350) (i32.add (local.get $ptr) (i32.const 1))))
              (i32.load8_u (local.get $ptr))
            )
            (local.set $ptr (i32.sub (local.get $ptr) (i32.const 1)))
            (br $rev_loop)
          )
        )
      )
    )

    ;; Print the number
    (call $print_str (i32.const 300) (local.get $len))
  )
)
