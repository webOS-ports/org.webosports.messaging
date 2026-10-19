/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * layout/Panels, reduced to the one static formFactor overrides. Keeping the real default here
 * means a test can check that the override actually replaced it.
 */

module.exports = {
    isNarrowDevice: function () { return false; }
};
