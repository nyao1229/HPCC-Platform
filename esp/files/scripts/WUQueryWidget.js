/*##############################################################################
#   HPCC SYSTEMS software Copyright (C) 2012 HPCC Systems.
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.
############################################################################## */
define([
    "dojo/_base/declare",
    "dojo/_base/array",
    "dojo/dom",
    "dojo/on",
    "dojo/dom-class",
    "dojo/date",

    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dijit/registry",
    "dijit/Menu",
    "dijit/MenuItem",
    "dijit/MenuSeparator",
    "dijit/PopupMenuItem",
    "dijit/Dialog",

    "dojox/grid/EnhancedGrid",
    "dojox/grid/enhanced/plugins/Pagination",
    "dojox/grid/enhanced/plugins/IndirectSelection",
    "dojox/widget/Calendar",

    "hpcc/_TabContainerWidget",
    "hpcc/ESPWorkunit",
    "hpcc/WsWorkunits",
    "hpcc/WUDetailsWidget",

    "dojo/text!../templates/WUQueryWidget.html",

    "dijit/layout/BorderContainer",
    "dijit/layout/TabContainer",
    "dijit/layout/ContentPane",
    "dijit/form/Textarea",
    "dijit/form/DateTextBox",
    "dijit/form/TimeTextBox",
    "dijit/form/Button",
    "dijit/form/RadioButton",
    "dijit/form/Select",
    "dijit/Toolbar",
    "dijit/TooltipDialog"
], function (declare, arrayUtil, dom, on, domClass, date,
                _TemplatedMixin, _WidgetsInTemplateMixin, registry, Menu, MenuItem, MenuSeparator, PopupMenuItem, Dialog,
                EnhancedGrid, Pagination, IndirectSelection, Calendar,
                _TabContainerWidget, ESPWorkunit, WsWorkunits, WUDetailsWidget,
                template) {
    return declare("WUQueryWidget", [_TabContainerWidget, _TemplatedMixin, _WidgetsInTemplateMixin], {
        templateString: template,
        baseClass: "WUQueryWidget",

        workunitsTab: null,
        workunitsGrid: null,
        legacyPane: null,
        legacyPaneLoaded: false,

        tabMap: [],

        validateDialog: null,

        postCreate: function (args) {
            this.inherited(arguments);
            this.workunitsTab = registry.byId(this.id + "_Workunits");
            this.workunitsGrid = registry.byId(this.id + "WorkunitsGrid");
            this.legacyPane = registry.byId(this.id + "_Legacy");
        },

        startup: function (args) {
            this.inherited(arguments);
            this.initWorkunitsGrid();
            this.initFilter();
            this.initContextMenu();
            this.refreshActionState();
        },

        resize: function (args) {
            this.inherited(arguments);

            //  TODO:  This should not be needed
            var context = this;
            setTimeout(function () {
                context.borderContainer.resize();
            }, 100);
        },

        //  Hitched actions  ---
        _onRefresh: function (event) {
            this.refreshGrid();
        },
        _onOpen: function (event) {
            //dojo.publish("hpcc/standbyForegroundShow");
            var selections = this.workunitsGrid.selection.getSelected();
            var firstTab = null;
            for (var i = selections.length - 1; i >= 0; --i) {
                var tab = this.ensurePane(this.id + "_" + selections[i].Wuid, {
                    Wuid: selections[i].Wuid
                });
                if (i == 0) {
                    firstTab = tab;
                }
            }
            if (firstTab) {
                this.selectChild(firstTab);
            }
            //dojo.publish("hpcc/standbyForegroundHide");
        },
        _onDelete: function (event) {
            if (confirm('Delete selected workunits?')) {
                var context = this;
                var selection = this.workunitsGrid.selection.getSelected();
                WsWorkunits.WUAction(selection, "Delete", {
                    load: function (response) {
                        arrayUtil.forEach(selection, function (item, idx) {
                            context.objectStore.objectStore.remove(item);
                        });
                        context.workunitsGrid.rowSelectCell.toggleAllSelection(false);
                        context.refreshGrid(response);
                    }
                });
            }
        },
        _onSetToFailed: function (event) {
            var context = this;
            WsWorkunits.WUAction(this.workunitsGrid.selection.getSelected(), "SetToFailed", {
                load: function (response) {
                    context.refreshGrid(response);
                }
            });
        },
        _onAbort: function (event) {
            var context = this;
            WsWorkunits.WUAction(this.workunitsGrid.selection.getSelected(), "Abort", {
                load: function (response) {
                    context.refreshGrid(response);
                }
            });
        },
        _onProtect: function (event) {
            var context = this;
            var selection = this.workunitsGrid.selection.getSelected();
            WsWorkunits.WUAction(selection, "Protect", {
                load: function (response) {
                    context.refreshGrid(response);
                }
            });
        },
        _onUnprotect: function (event) {
            var context = this;
            var selection = this.workunitsGrid.selection.getSelected();
            WsWorkunits.WUAction(selection, "Unprotect", {
                load: function (response) {
                    context.refreshGrid(response);
                }
            });
        },
        _onReschedule: function (event) {
        },
        _onDeschedule: function (event) {
        },
        _onClickFilterApply: function (event) {
            this.workunitsGrid.rowSelectCell.toggleAllSelection(false);

            this.refreshGrid();
        },
        _onFilterApply: function (event) {
            this.workunitsGrid.rowSelectCell.toggleAllSelection(false);
            if (this.hasFilter()) {
                registry.byId(this.id + "FilterDropDown").closeDropDown();
                this.refreshGrid();
            } else {
                this.validateDialog.show();
            }
        },
        _onFilterClear: function (event, supressGridRefresh) {
            this.workunitsGrid.rowSelectCell.toggleAllSelection(false);
            dom.byId(this.id + "Owner").value = "";
            dom.byId(this.id + "Jobname").value = "";
            dom.byId(this.id + "Cluster").value = "";
            dom.byId(this.id + "State").value = "";
            dom.byId(this.id + "ECL").value = "";
            dom.byId(this.id + "LogicalFile").value = "";
            dom.byId(this.id + "LogicalFileSearchType").value = "";
            dom.byId(this.id + "FromDate").value = "";
            dom.byId(this.id + "FromTime").value = "";
            dom.byId(this.id + "ToDate").value = "";
            dom.byId(this.id + "LastNDays").value = "";
            if (!supressGridRefresh) {
                this.refreshGrid();
            }
        },
        _onRowDblClick: function (wuid) {
            var wuTab = this.ensurePane(this.id + "_" + wuid, {
                Wuid: wuid
            });
            this.selectChild(wuTab);
        },
        _onRowContextMenu: function (idx, item, colField, mystring) {
            var selection = this.workunitsGrid.selection.getSelected();
            var found = arrayUtil.indexOf(selection, item);
            if (found == -1) {
                this.workunitsGrid.selection.deselectAll();
                this.workunitsGrid.selection.setSelected(idx, true);
            }

            this.menuFilterOwner.set("disabled", false);
            this.menuFilterJobname.set("disabled", false);
            this.menuFilterCluster.set("disabled", false);
            this.menuFilterState.set("disabled", false);

            if (item) {
                this.menuFilterOwner.set("label", "Owner:  " + item.Owner);
                this.menuFilterOwner.set("hpcc_value", item.Owner);
                this.menuFilterJobname.set("label", "Jobname:  " + item.Jobname);
                this.menuFilterJobname.set("hpcc_value", item.Jobname);
                this.menuFilterCluster.set("label", "Cluster:  " + item.Cluster);
                this.menuFilterCluster.set("hpcc_value", item.Cluster);
                this.menuFilterState.set("label", "State:  " + item.State);
                this.menuFilterState.set("hpcc_value", item.State);
            }

            if (item.Owner == "") {
                this.menuFilterOwner.set("disabled", true);
                this.menuFilterOwner.set("label", "Owner:  " + "N/A");
            }
            if (item.Jobname == "") {
                this.menuFilterJobname.set("disabled", true);
                this.menuFilterJobname.set("label", "Jobname:  " + "N/A");
            }
            if (item.Cluster == "") {
                this.menuFilterCluster.set("disabled", true);
                this.menuFilterCluster.set("label", "Cluster:  " + "N/A");
            }
            if (item.State == "") {
                this.menuFilterState.set("disabled", true);
                this.menuFilterState.set("label", "State:  " + "N/A");
            }
        },

        //  Implementation  ---
        hasFilter: function () {
            return dom.byId(this.id + "Owner").value !== "" ||
               dom.byId(this.id + "Jobname").value !== "" ||
               dom.byId(this.id + "Cluster").value !== "" ||
               dom.byId(this.id + "State").value !== "" ||
               dom.byId(this.id + "ECL").value !== "" ||
               dom.byId(this.id + "LogicalFile").value !== "" ||
               dom.byId(this.id + "FromDate").value !== "" ||
               dom.byId(this.id + "FromTime").value !== "" ||
               dom.byId(this.id + "ToDate").value !== "" ||
               dom.byId(this.id + "LastNDays").value !== "";
        },

        getFilter: function () {
            var retVal = {
                Owner: dom.byId(this.id + "Owner").value,
                Jobname: dom.byId(this.id + "Jobname").value,
                Cluster: dom.byId(this.id + "Cluster").value,
                State: dom.byId(this.id + "State").value,
                ECL: dom.byId(this.id + "ECL").value,
                LogicalFile: dom.byId(this.id + "LogicalFile").value,
                LogicalFileSearchType: registry.byId(this.id + "LogicalFileSearchType").get("value"),
                StartDate: this.getISOString("FromDate", "FromTime"),
                EndDate: this.getISOString("ToDate", "ToTime"),
                LastNDays: dom.byId(this.id + "LastNDays").value
            };
            if (retVal.StartDate != "" && retVal.EndDate != "") {
                retVal["DateRB"] = "0";
            } else if (retVal.LastNDays != "") {
                retVal["DateRB"] = "0";
                var now = new Date();
                retVal.StartDate = date.add(now, "day", retVal.LastNDays * -1).toISOString();
                retVal.EndDate = now.toISOString();
            }
            return retVal;
        },

        getISOString: function (dateField, timeField) {
            var d = registry.byId(this.id + dateField).attr("value");
            var t = registry.byId(this.id + timeField).attr("value");
            if (d) {
                if (t) {
                    d.setHours(t.getHours());
                    d.setMinutes(t.getMinutes());
                    d.setSeconds(t.getSeconds());
                }
                return d.toISOString();
            }
            return "";
        },

        //  Implementation  ---
        init: function (params) {
            if (this.initalized)
                return;
            this.initalized = true;

            this.selectChild(this.workunitsTab, true);
        },

        initTab: function () {
            var currSel = this.getSelectedChild();
            if (currSel && !currSel.initalized) {
                if (currSel.id == this.workunitsTab.id) {
                } else if (currSel.id == this.legacyPane.id) {
                    if (!this.legacyPaneLoaded) {
                        this.legacyPaneLoaded = true;
                        this.legacyPane.set("content", dojo.create("iframe", {
                            src: "/WsWorkunits/WUQuery",
                            style: "border: 0; width: 100%; height: 100%"
                        }));
                    }
                } else {
                    if (!currSel.initalized) {
                        currSel.init(currSel.params);
                    }
                }
            }
        },

        addMenuItem: function (menu, details) {
            var menuItem = new MenuItem(details);
            menu.addChild(menuItem);
            return menuItem;
        },

        initContextMenu: function () {
            var context = this;
            var pMenu = new Menu({
                targetNodeIds: [this.id + "WorkunitsGrid"]
            });
            this.menuOpen = this.addMenuItem(pMenu, {
                label: "Open",
                onClick: function () { context._onOpen(); }
            });
            this.menuDelete = this.addMenuItem(pMenu, {
                label: "Delete",
                onClick: function () { context._onDelete(); }
            });
            this.menuSetToFailed = this.addMenuItem(pMenu, {
                label: "Set To Failed",
                onClick: function () { context._onSetToFailed(); }
            });
            pMenu.addChild(new MenuSeparator());
            this.menuProtect = this.addMenuItem(pMenu, {
                label: "Protect",
                onClick: function () { context._onProtect(); }
            });
            this.menuUnprotect = this.addMenuItem(pMenu, {
                label: "Unprotect",
                onClick: function () { context._onUnprotect(); }
            });
            pMenu.addChild(new MenuSeparator());
            this.menuReschedule = this.addMenuItem(pMenu, {
                label: "Reschedule",
                onClick: function () { context._onReschedule(); }
            });
            this.menuDeschedule = this.addMenuItem(pMenu, {
                label: "Deschedule",
                onClick: function () { context._onDeschedule(); }
            });
            pMenu.addChild(new MenuSeparator());
            {
                var pSubMenu = new Menu();
                this.menuFilterOwner = this.addMenuItem(pSubMenu, {
                    onClick: function (args) {
                        context._onFilterClear(null, true);
                        registry.byId(context.id + "Owner").set("value", context.menuFilterOwner.get("hpcc_value"));
                        context._onClickFilterApply();
                    }
                });
                this.menuFilterJobname = this.addMenuItem(pSubMenu, {
                    onClick: function (args) {
                        context._onFilterClear(null, true);
                        registry.byId(context.id + "Jobname").set("value", context.menuFilterJobname.get("hpcc_value"));
                        context._onClickFilterApply();
                    }
                });
                this.menuFilterCluster = this.addMenuItem(pSubMenu, {
                    onClick: function (args) {
                        context._onFilterClear(null, true);
                        registry.byId(context.id + "Cluster").set("value", context.menuFilterCluster.get("hpcc_value"));
                        context._onClickFilterApply();
                    }
                });
                this.menuFilterState = this.addMenuItem(pSubMenu, {
                    onClick: function (args) {
                        context._onFilterClear(null, true);
                        registry.byId(context.id + "State").set("value", context.menuFilterState.get("hpcc_value"));
                        context._onClickFilterApply();
                    }
                });
                pSubMenu.addChild(new MenuSeparator());
                this.menuFilterClearFilter = this.addMenuItem(pSubMenu, {
                    label: "Clear",
                    onClick: function () { context._onFilterClear(); }
                });
                pMenu.addChild(new PopupMenuItem({
                    label: "Filter",
                    popup: pSubMenu
                }));
            }
            pMenu.startup();
        },

        initWorkunitsGrid: function () {
            var context = this;
            this.workunitsGrid.setStructure([
                {
                    name: "<img src='../files/img/locked.png'>",
                    field: "Protected",
                    width: "16px",
                    formatter: function (protected) {
                        if (protected == true) {
                            return ("<img src='../files/img/locked.png'>");
                        }
                        return "";
                    }
                },
                {
                    name: "Wuid", field: "Wuid", width: "15",
                    formatter: function (Wuid) {
                        var wu = ESPWorkunit.Get(Wuid);
                        return ("<img src='../files/" + wu.getStateImage() + "'>&nbsp" + Wuid);
                    }
                },
                { name: "Owner", field: "Owner", width: "8" },
                { name: "Job Name", field: "Jobname", width: "16" },
                { name: "Cluster", field: "Cluster", width: "8" },
                { name: "Roxie Cluster", field: "RoxieCluster", width: "8" },
                { name: "State", field: "State", width: "8" },
                { name: "Total Thor Time", field: "TotalThorTime", width: "8" }
            ]);

            this.objectStore = ESPWorkunit.CreateWUQueryObjectStore();
            this.workunitsGrid.setStore(this.objectStore);
            this.workunitsGrid.setQuery(this.getFilter());
            this.workunitsGrid.noDataMessage = "<span class='dojoxGridNoData'>Zero Workunits (check filter).</span>";

            this.workunitsGrid.on("RowDblClick", function (evt) {
                if (context._onRowDblClick) {
                    var idx = evt.rowIndex;
                    var item = this.getItem(idx);
                    var Wuid = this.store.getValue(item, "Wuid");
                    context._onRowDblClick(Wuid);
                }
            }, true);

            this.workunitsGrid.on("RowContextMenu", function (evt) {
                if (context._onRowContextMenu) {
                    var idx = evt.rowIndex;
                    var colField = evt.cell.field;
                    var item = this.getItem(idx);
                    var mystring = "item." + colField;
                    context._onRowContextMenu(idx, item, colField, mystring);
                }
            }, true);
            var today = new Date();

            dojo.connect(this.workunitsGrid.selection, 'onSelected', function (idx) {
                context.refreshActionState();
            });
            dojo.connect(this.workunitsGrid.selection, 'onDeselected', function (idx) {
                context.refreshActionState();
            });
            this.workunitsGrid.startup();
        },

        initFilter: function () {
            this.validateDialog = new Dialog({
                title: "Filter",
                content: "No filter criteria specified."
            });
            dojo.connect(registry.byId(this.id + "FromDate"), 'onClick', function (evt) {
            });
            dojo.connect(registry.byId(this.id + "ToDate"), 'onClick', function (evt) {
            });
        },

        refreshGrid: function (args) {
            this.workunitsGrid.setQuery(this.getFilter());
            var context = this;
            setTimeout(function () {
                context.refreshActionState()
            }, 200);
        },

        refreshActionState: function () {
            var selection = this.workunitsGrid.selection.getSelected();
            var hasSelection = false;
            var hasProtected = false;
            var hasNotProtected = false;
            var hasFailed = false;
            var hasNotFailed = false;
            var hasFilter = this.hasFilter();
            var hasCompleted = false;
            var hasNotCompleted = false;
            for (var i = 0; i < selection.length; ++i) {
                hasSelection = true;
                if (selection[i] && selection[i].Protected !== null) {
                    if (selection[i].Protected != "0") {
                        hasProtected = true;
                    } else {
                        hasNotProtected = true;
                    }
                }
                if (selection[i] && selection[i].StateID !== null) {
                    if (selection[i].StateID == "4") {
                        hasFailed = true;
                    } else {
                        hasNotFailed = true;
                    }
                    if (WsWorkunits.isComplete(selection[i].StateID)) {
                        hasCompleted = true;
                    } else {
                        hasNotCompleted = true;
                    }
                }
            }

            registry.byId(this.id + "Open").set("disabled", !hasSelection);
            registry.byId(this.id + "Delete").set("disabled", !hasNotProtected);
            registry.byId(this.id + "Abort").set("disabled", !hasNotCompleted);
            registry.byId(this.id + "SetToFailed").set("disabled", !hasNotProtected);
            registry.byId(this.id + "Protect").set("disabled", !hasNotProtected);
            registry.byId(this.id + "Unprotect").set("disabled", !hasProtected);
            registry.byId(this.id + "Reschedule").set("disabled", true);    //TODO
            registry.byId(this.id + "Deschedule").set("disabled", true);    //TODO

            this.menuProtect.set("disabled", !hasNotProtected);
            this.menuUnprotect.set("disabled", !hasProtected);

            dom.byId(this.id + "IconFilter").src = hasFilter ? "img/filter.png" : "img/noFilter.png";
        },

        ensurePane: function (id, params) {
            var retVal = this.tabMap[id];
            if (!retVal) {
                var context = this;
                retVal = new WUDetailsWidget({
                    id: id,
                    title: params.Wuid,
                    closable: false,
                    onClose: function () {
                        delete context.tabMap[id];
                        return true;
                    },
                    params: params
                });
                this.tabMap[id] = retVal;
                this.addChild(retVal, 2);
            }
            return retVal;
        }

    });
});
