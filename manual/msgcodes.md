W001: Actual drive position must be number between 0 and 100, but received
W002: No context to restore, so sensor states are unknown. See https://nodered.org/docs/user-guide/context#saving-context-data-to-the-file-system how to save states.
W003: Undefined hard lock variable at '" + config.hardlockType + "." + config.hardlock + "'. Assuming false until set.
W004: Hard lock variable at '" + config.hardlockType + "." + config.hardlock + "' defined but not a boolean. Assuming false until set.

E001: setposHeight is not valid (received '" + context.setposHeight + "')
E002: setposHeight is negative (received '" + context.setposHeight + "')
E003: setposHeight is above 100 (received '" + context.setposHeight + "')
E004: Suntimes calculator seems broken. Please consult the developer!
E005: Undefined hardlock type
E006: Cannot find any valid sunrise or sunset time