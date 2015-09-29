// 
// NReco PivotTable Extensions
// Author: Vitaliy Fedorchenko
// 
// Copyright (c) nrecosite.com - All Rights Reserved
// THIS CODE AND INFORMATION ARE PROVIDED "AS IS" WITHOUT WARRANTY OF ANY 
// KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND/OR FITNESS FOR A
// PARTICULAR PURPOSE.
//
(function () {
	var $;

	$ = jQuery;

	var applyDrillDownHandler = function (wrapper, pvtData, tElem) {
		if (!wrapper.options.drillDownHandler)
			return;
		$(tElem).addClass('pvtValDrillDown').on("click", "td.pvtVal,td.pvtTotal", function () {
			var cssClasses = $(this).attr('class').split(' ');
			var colIdx = -1, rowIdx = -1;
			if ($.inArray("pvtVal", cssClasses) >= 0) {
				$.each(cssClasses, function () {
					if (this.indexOf('row') == 0) rowIdx = parseInt(this.substring(3));
					if (this.indexOf('col') == 0) colIdx = parseInt(this.substring(3));
				});
			}
			if ($.inArray("rowTotal", cssClasses) >= 0) {
				var dataFor = $(this).attr('data-for');
				rowIdx = parseInt(dataFor.substring(3));
			}
			if ($.inArray("colTotal", cssClasses) >= 0) {
				var dataFor = $(this).attr('data-for');
				colIdx = parseInt(dataFor.substring(3));
			}
			var dataFilter = {};
			if (colIdx >= 0) {
				for (var cAttrIdx = 0; cAttrIdx < pvtData.colAttrs.length; cAttrIdx++) {
					var colKeys = pvtData.getColKeys();
					var cValues = colKeys[colIdx];
					dataFilter[pvtData.colAttrs[cAttrIdx]] = cValues[cAttrIdx];
				}
			}
			if (rowIdx >= 0) {
				for (var rAttrIdx = 0; rAttrIdx < pvtData.rowAttrs.length; rAttrIdx++) {
					var rowKeys = pvtData.getRowKeys();
					var rValues = rowKeys[rowIdx];
					dataFilter[pvtData.rowAttrs[rAttrIdx]] = rValues[rAttrIdx];
				}
			}
			wrapper.options.drillDownHandler(dataFilter);
		});
	};

	var sortDataByCol = function (pvtData, sortByColIdx, ascDesc) {
		var sortRowVals = [];
		var rowKey, colKey, aggregator, i;

		pvtData.sorted = false; // flush row/col order
		var rowKeys = pvtData.getRowKeys();
		var colKeys = pvtData.getColKeys();

		for (i in rowKeys) {
			rowKey = rowKeys[i];
			colKey = sortByColIdx != null ? colKeys[sortByColIdx] : [];
			aggregator = pvtData.getAggregator(rowKey, colKey);
			sortRowVals.push({ val: aggregator.value(), key: rowKey });
		}
		sortRowVals.sort(function (a, b) {
			return ascDesc * $.pivotUtilities.naturalSort(a.val, b.val);
		});
		pvtData.rowKeys = [];
		for (i = 0; i < sortRowVals.length; i++)
			pvtData.rowKeys.push(sortRowVals[i].key);
		pvtData.sorted = true;
	};

	var sortDataByRow = function (pvtData, sortByRowIdx, ascDesc) {
		var sortColVals = [];
		var rowKey, colKey, aggregator, i;

		pvtData.sorted = false; // flush row/col order
		var rowKeys = pvtData.getRowKeys();
		var colKeys = pvtData.getColKeys();

		for (i in colKeys) {
			colKey = colKeys[i];
			rowKey = sortByRowIdx != null ? rowKeys[sortByRowIdx] : [];
			aggregator = pvtData.getAggregator(rowKey, colKey);
			sortColVals.push({ val: aggregator.value(), key: colKey });
		}
		sortColVals.sort(function (a, b) {
			return ascDesc * $.pivotUtilities.naturalSort(a.val, b.val);
		});
		pvtData.colKeys = [];
		for (i = 0; i < sortColVals.length; i++)
			pvtData.colKeys.push(sortColVals[i].key);
		pvtData.sorted = true;
	};

	var applySortHandler = function (wrapper, pvtData, opts, tElem, refreshTable) {
		var applyAscDescClass = function ($elem, direction) {
			$elem.addClass(direction == "desc" ? "pvtSortDesc" : "pvtSortAsc");
		};
		var applySort = function (keys, labels, optSortKey, doSort) {
			labels.click(function () {
				var $lbl = $(this);
				var keyIdx = $lbl.data('key_index');
				var key = keys[keyIdx];

				if ($lbl.hasClass("pvtSortAsc")) {
					doSort(pvtData, keyIdx, -1);
					opts.sort = {direction: "desc"};
					opts.sort[optSortKey] = key;
				} else if ($lbl.hasClass("pvtSortDesc")) {
					pvtData.sorted = false;
					opts.sort = null;
				} else {
					doSort(pvtData, keyIdx, 1);
					opts.sort = {direction: "asc"};
					opts.sort[optSortKey] = key;
				}
				refreshTable();
			}).each(function () {
				if (opts.sort && opts.sort[optSortKey]) {
					var $lbl = $(this);
					var key = keys[$lbl.data('key_index')];
					if (key.join('_') == opts.sort[optSortKey].join('_')) {
						applyAscDescClass($lbl, opts.sort.direction);
					}
				}
			});
		};
		var markSortableLabels = function (keys, $labels) {
			var i = 0;
			$labels.each(function () {
				var $lbl = $(this);
				var lblText = $.trim( $lbl.text() );
				var k = keys[i];
				if (k!=null && k.length>0 && k[k.length - 1] == lblText) {
					$lbl.addClass("pvtSortable").data('key_index', i);
					i++;
					return;
				}
			});
		};
		var colKeys = pvtData.getColKeys();
		markSortableLabels(colKeys, $(tElem).find('.pvtColLabel[colspan="1"]'));
		applySort(colKeys, $(tElem).find('.pvtColLabel.pvtSortable[colspan="1"]'), "column_key", sortDataByCol);

		var rowKeys = pvtData.getRowKeys();
		markSortableLabels(rowKeys, $(tElem).find('.pvtRowLabel[rowspan="1"]'));
		applySort(rowKeys, $(tElem).find('.pvtRowLabel.pvtSortable[rowspan="1"]'), "row_key", sortDataByRow);

		$(tElem).find('tr:last .pvtTotalLabel').addClass("pvtTotalColSortable").click(function () {
			var $lbl = $(this);
			if ($lbl.hasClass("pvtSortAsc")) {
				sortDataByRow(pvtData, null, -1);
				opts.sort = { direction: "desc", row_totals: true };
			} else if ($lbl.hasClass("pvtSortDesc")) {
				pvtData.sorted = false;
				opts.sort = null;
			} else {
				sortDataByRow(pvtData, null, 1);
				opts.sort = { direction: "asc", row_totals: true };
			}
			refreshTable();
		}).each(function () {
			var $lbl = $(this);
			if (opts.sort && opts.sort.row_totals) {
				applyAscDescClass($lbl, opts.sort.direction);
			}
		});

		$(tElem).find('tr:first .pvtTotalLabel').addClass("pvtTotalRowSortable").click(function () {
			var $lbl = $(this);
			if ($lbl.hasClass("pvtSortAsc")) {
				sortDataByCol(pvtData, null, -1);
				opts.sort = { direction: "desc", col_totals: true };
			} else if ($lbl.hasClass("pvtSortDesc")) {
				pvtData.sorted = false;
				opts.sort = null;
			} else {
				sortDataByCol(pvtData, null, 1);
				opts.sort = { direction: "asc", col_totals: true };
			}
			refreshTable();
		}).each(function () {
			var $lbl = $(this);
			if (opts.sort && opts.sort.col_totals) {
				applyAscDescClass($lbl, opts.sort.direction);
			}
		});

	};
	var preparePivotData = function (pvtData) {
		var i, j, aggregator;
		var colKeys = pvtData.getColKeys();
		var rowKeys = pvtData.getRowKeys();
		var data = [];
		var totalsRow = [];
		var totalsCol = [];
		for (i in rowKeys) {
			data[i] = [];
			for (j in colKeys) {
				aggregator = pvtData.getAggregator(rowKeys[i], colKeys[j]);
				data[i][j] = aggregator.value();
			}
			totalsCol[i] = pvtData.getAggregator(rowKeys[i], []).value();
		}
		for (j in colKeys) {
			totalsRow[j] = pvtData.getAggregator([], colKeys[j]).value();
		}
		return {
			columnKeys: colKeys,
			columnAttrs : pvtData.colAttrs,
			rowKeys: rowKeys,
			rowAttrs : pvtData.rowAttrs, 
			matrix: data,
			totals: { row: totalsRow, column : totalsCol }
		};
	};

	window.NRecoPivotTableExtensions = function (options) {
		this.options = $.extend(NRecoPivotTableExtensions.defaults, options);
	};

	window.NRecoPivotTableExtensions.prototype.sortDataByOpts = function (pvtData, opts) {
		pvtData.sorted = false;
		if (opts && opts.sort) {
			var ascDesc = opts.sort.direction == "desc" ? -1 : 1;
			if (opts.sort.column_key) {
				var colKeys = pvtData.getColKeys();
				var sortByKeyStr = opts.sort.column_key.join('_');
				for (var i in colKeys)
					if (sortByKeyStr == colKeys[i].join('_')) {
						sortDataByCol(pvtData, i, ascDesc);
					}
			} else if (opts.sort.row_key) {
				var rowKeys = pvtData.getRowKeys();
				var sortByKeyStr = opts.sort.row_key.join('_');
				for (var i in rowKeys)
					if (sortByKeyStr == rowKeys[i].join('_')) {
						sortDataByRow(pvtData, i, ascDesc);
					}
			} else if (opts.sort.row_totals) {
				sortDataByRow(pvtData, null, ascDesc);
			} else if (opts.sort.col_totals) {
				sortDataByCol(pvtData, null, ascDesc);
			}
		}
	};

	window.NRecoPivotTableExtensions.prototype.wrapTableRenderer = function (tableRenderer) {
		var wrapper = this;
		return function (pvtData, opts) {
			var tElem, refreshTable, wrapTable;
			if (opts)
				wrapper.sortDataByOpts(pvtData, opts);
			tElem = tableRenderer(pvtData, opts);
			wrapTable = function ($t) {
				if (wrapper.options.wrapWith) {
					var $w = $(wrapper.options.wrapWith);
					$w.append($t);
					$t = $w;
				}
				return $t;
			};
			refreshTable = function () {
				var newTbl = tableRenderer(pvtData, opts);
				applyDrillDownHandler(wrapper,pvtData,newTbl);
				applySortHandler(wrapper, pvtData, opts, newTbl, refreshTable);
				$(tElem).replaceWith(newTbl);
				tElem = newTbl;
			};
			applyDrillDownHandler(wrapper, pvtData, tElem);
			applySortHandler(wrapper, pvtData, opts, tElem, refreshTable);
			return wrapTable(tElem);
		};
	};

	window.NRecoPivotTableExtensions.prototype.wrapPivotExportRenderer = function (renderer) {
		return function (pvtData, opts) {
			var elem = renderer(pvtData, opts);
			$(elem).addClass("pivotExportData").data("getPivotExportData", function () { return preparePivotData(pvtData); });
			return elem;
		};
	};

	window.NRecoPivotTableExtensions.defaults = {
		drillDownHandler: null,
		wrapWith : null
	};

}).call(this);