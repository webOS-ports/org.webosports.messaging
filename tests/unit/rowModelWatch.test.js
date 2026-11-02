/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/rowModelWatch.js - a row follows a change to the model it already has.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var rowModelWatch = bootstrap.load('util/rowModelWatch.js');

function modelWith(attributes) {
    var listeners = [];
    return {
        attributes: attributes,
        on: function (event, fn) { assert.equal(event, 'change'); listeners.push(fn); },
        off: function (event, fn) { listeners = listeners.filter(function (l) { return l !== fn; }); },
        emit: function () { listeners.slice().forEach(function (l) { l(); }); },
        listeners: function () { return listeners.length; }
    };
}

function rowWith(model) {
    return { model: model, drawn: 0, populateRow: function () { this.drawn++; } };
}

describe('rowModelWatch', function () {
    it('redraws when the status of a merged message changes', function () {
        var model = modelWith({ _id: '1', status: 'pending' });
        var row = rowWith(model);
        rowModelWatch.show(row);
        assert.equal(row.drawn, 1);
        model.attributes.status = 'successful';
        model.emit();
        assert.equal(row.drawn, 2);
    });

    it('does not redraw when a merge only brought equal data', function () {
        var model = modelWith({ _id: '1', to: [{ addr: 'a' }] });
        var row = rowWith(model);
        rowModelWatch.show(row);
        model.attributes.to = [{ addr: 'a' }];
        model.emit();
        assert.equal(row.drawn, 1);
    });

    it('draws a row once for show() followed by the same model', function () {
        var model = modelWith({ _id: '1' });
        var row = rowWith(model);
        rowModelWatch.show(row);
        rowModelWatch.show(row);
        assert.equal(row.drawn, 1);
        assert.equal(model.listeners(), 1);
    });

    it('follows a reassigned model and lets go of the old one', function () {
        var first = modelWith({ _id: '1' }), second = modelWith({ _id: '2' });
        var row = rowWith(first);
        rowModelWatch.show(row);
        row.model = second;
        rowModelWatch.show(row);
        assert.equal(row.drawn, 2);
        assert.equal(first.listeners(), 0);
        assert.equal(second.listeners(), 1);
    });

    it('lets go of the model when stopped', function () {
        var model = modelWith({ _id: '1' });
        var row = rowWith(model);
        rowModelWatch.show(row);
        rowModelWatch.stop(row);
        assert.equal(model.listeners(), 0);
        model.attributes.status = 'failed';
        model.emit();
        assert.equal(row.drawn, 1);
    });

    it('watches again when shown after being stopped', function () {
        var model = modelWith({ _id: '1' });
        var row = rowWith(model);
        rowModelWatch.show(row);
        rowModelWatch.stop(row);
        rowModelWatch.show(row);
        assert.equal(model.listeners(), 1);
    });

    it('copes with a row whose model went', function () {
        var model = modelWith({ _id: '1' });
        var row = rowWith(model);
        rowModelWatch.show(row);
        row.model = null;
        rowModelWatch.show(row);
        assert.equal(model.listeners(), 0);
        assert.equal(row.drawn, 2);
    });
});
