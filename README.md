# SoftScript [WIP]

This is the repo for `SoftScript`, a scripting language that targets the Apple II.

The language is still poorly defined, and it isn't very good.

But, given a SoftScript program, this repo offers:
(1) [WIP] A basic compiler
(2) [WIP] A SoftScript -> AppleSoft BASIC transpiler
(3) An AppleSoft BASIC -> Apple II Cassette Archive converter

There is also:
(4) An Apple II Cassette Archive -> AppleSoft BASIC/data converter
(5) An AppleSoft Basic assembler/disassembler

This is largely a learning project. Everything in this repo is done from scratch, including:
(1) WAVE file generation
(2) WAVE file reading, and signal processing
(3) The SoftScript parser and transpiler

There is a singular test file so far, but it is mostly used for running some local generation while this program has been built out. Major cleanup and proper documentation and tests will be added at a later point.