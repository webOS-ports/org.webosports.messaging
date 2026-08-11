/**
 * Date "buckets" for list dividers, ported from com.palm.app.messaging/utilities/BucketDateFormatter.js.
 *
 * Buckets follow Outlook's scheme:
 *   Present: Today
 *   Past:    day of week, Last week, 2 weeks ago, 3 weeks ago, Month Year
 *   Future:  Tomorrow, day of week, Next week, 2/3 weeks from now, Month Year
 *
 * Mojo's enyo.g11n.DateFmt is replaced by moment, which is already a dependency of this app.
 */

var moment = require('moment'),
    $L = require('enyo/i18n').$L;

var BucketDateFormatter = module.exports = {
    CONST: {
        TODAY: $L("Today"),
        LAST_WEEK: $L("Last week"),
        TWO_WEEKS_AGO: $L("2 weeks ago"),
        THREE_WEEKS_AGO: $L("3 weeks ago"),
        TOMORROW: $L("Tomorrow"),
        NEXT_WEEK: $L("Next week"),
        TWO_WEEKS_FROM_NOW: $L("2 weeks from now"),
        THREE_WEEKS_FROM_NOW: $L("3 weeks from now"),
        DAYS_PER_WEEK: 7,
        DAY_IN_MS: 1000 * 60 * 60 * 24
    },

    createNewDateWithClearedTime: function (d) {
        var newDate = new Date();
        newDate.setTime(d.getTime());
        this.wipeTime(newDate);
        return newDate;
    },

    /**
     * @param date              the date to bucket
     * @param shouldAppendTime  append the time to buckets where it makes sense
     * @param showTodayTimeOnly for "Today", show only the time
     */
    getDateBucket: function (date, shouldAppendTime, showTodayTimeOnly) {
        var currentDay = this.createNewDateWithClearedTime(new Date());
        var localDate = this.createNewDateWithClearedTime(date);
        var appendTime = shouldAppendTime ? moment(date).format("LT") : "";

        return this.getDateBucketFromInstant(date, localDate, currentDay, appendTime, showTodayTimeOnly);
    },

    getDateBucketFromInstant: function (date, localDate, referencePointDate, appendTime, showTodayTimeOnly) {
        var result = "";
        var days;

        var differenceInDays = Math.floor(
            this.subtract(referencePointDate.getTime(), localDate.getTime()) / this.CONST.DAY_IN_MS);
        var differenceInDayOfMonth = Math.abs(referencePointDate.getDate() - localDate.getDate());

        if (differenceInDays === 0 && differenceInDayOfMonth === 0) {
            result = showTodayTimeOnly ? appendTime :
                (appendTime ? this.CONST.TODAY + " " + appendTime : this.CONST.TODAY);

        } else if (differenceInDays > 0 || (differenceInDays === 0 && differenceInDayOfMonth > 0)) {
            // The date is in the past.
            days = referencePointDate.getDay();   // 0..6 == Sunday..Saturday

            // Week boundaries, each the END of the given week: anything before lastWeek was in an
            // earlier week than the current one.
            var lastWeek = referencePointDate.getTime() - (days * this.CONST.DAY_IN_MS);
            var twoWeeksAgo = referencePointDate.getTime() -
                ((days + this.CONST.DAYS_PER_WEEK) * this.CONST.DAY_IN_MS);
            var threeWeeksAgo = referencePointDate.getTime() -
                ((days + (2 * this.CONST.DAYS_PER_WEEK)) * this.CONST.DAY_IN_MS);
            var oneMonthAgo = referencePointDate.getTime() -
                ((days + (3 * this.CONST.DAYS_PER_WEEK)) * this.CONST.DAY_IN_MS);

            if (this.isAfter(localDate.getTime(), lastWeek) || this.isEqual(localDate.getTime(), lastWeek)) {
                result = this.getDayOfWeek(localDate);
            } else if (this.isAfter(localDate.getTime(), twoWeeksAgo) || this.isEqual(localDate.getTime(), twoWeeksAgo)) {
                result = this.CONST.LAST_WEEK;
            } else if (this.isAfter(localDate.getTime(), threeWeeksAgo) || this.isEqual(localDate.getTime(), threeWeeksAgo)) {
                result = this.CONST.TWO_WEEKS_AGO;
            } else if (this.isAfter(localDate.getTime(), oneMonthAgo) || this.isEqual(localDate.getTime(), oneMonthAgo)) {
                result = this.CONST.THREE_WEEKS_AGO;
            } else {
                result = this.getMonthOfYear(localDate);
            }

        } else {
            // The date is in the future.
            if (differenceInDays === -1) {
                result = this.CONST.TOMORROW;
            } else {
                days = referencePointDate.getDay();

                // Week boundaries, each the START of the given week.
                var nextWeek = referencePointDate.getTime() +
                    ((this.CONST.DAYS_PER_WEEK - days) * this.CONST.DAY_IN_MS);
                var twoWeeksFuture = referencePointDate.getTime() +
                    ((this.CONST.DAYS_PER_WEEK - days + this.CONST.DAYS_PER_WEEK) * this.CONST.DAY_IN_MS);
                var threeWeeksFuture = referencePointDate.getTime() +
                    ((this.CONST.DAYS_PER_WEEK - days + 2 * this.CONST.DAYS_PER_WEEK) * this.CONST.DAY_IN_MS);
                var oneMonthFuture = referencePointDate.getTime() +
                    ((this.CONST.DAYS_PER_WEEK - days + 3 * this.CONST.DAYS_PER_WEEK) * this.CONST.DAY_IN_MS);

                if (this.isBefore(localDate.getTime(), nextWeek)) {
                    result = this.getDayOfWeek(localDate);
                } else if (this.isBefore(localDate.getTime(), twoWeeksFuture)) {
                    result = this.CONST.NEXT_WEEK;
                } else if (this.isBefore(localDate.getTime(), threeWeeksFuture)) {
                    result = this.CONST.TWO_WEEKS_FROM_NOW;
                } else if (this.isBefore(localDate.getTime(), oneMonthFuture)) {
                    result = this.CONST.THREE_WEEKS_FROM_NOW;
                } else {
                    result = this.getMonthOfYear(localDate);
                }
            }
        }

        return result ? result.toUpperCase() : result;
    },

    subtract: function (d1, d2) { return d1 - d2; },
    isAfter: function (d1, d2) { return d1 > d2; },
    isBefore: function (d1, d2) { return d1 < d2; },
    isEqual: function (d1, d2) { return d1 === d2; },

    wipeTime: function (d) {
        d.setHours(0);
        d.setMinutes(0);
        d.setSeconds(0);
        d.setMilliseconds(0);
    },

    isNumber: function (x) {
        return ((typeof x === typeof 1) && (null !== x) && isFinite(x));
    },

    getDayOfWeek: function (localDate) {
        return moment(localDate).format("dddd");
    },

    getMonthOfYear: function (localDate) {
        return moment(localDate).format("MMMM YYYY");
    }
};
