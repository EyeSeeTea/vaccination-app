import React from "react";
import PropTypes from "prop-types";
import {
    ConfirmationDialog,
    ObjectsTable,
    withSnackbar,
    withLoading,
    TableAction,
    TablePagination,
    TableState,
    TableSorting,
    TableColumn,
    ObjectsTableDetailField,
} from "@eyeseetea/d2-ui-components";
import _ from "lodash";

import PageHeader from "../shared/PageHeader";
import { formatDateShort } from "../../utils/date";
import TargetPopulationDialog from "./TargetPopulationDialog";
import { hasCurrentUserRoles } from "../../utils/permissions";
import { withPageVisited } from "../utils/page-visited-app";
import "./CampaignConfiguration.css";
import { Button } from "@material-ui/core";
import { Dashboard, Delete, Details, Edit, LibraryBooks, People } from "@material-ui/icons";
import i18n from "../../locales";
import { CompositionRoot } from "../../CompositionRoot";
import { D2Api } from "../../types/d2-api";
import { MetadataConfig } from "../../models/config";
import { CampaignSummary } from "../../domain/entities/CampaignSummary";

type DataSetRow = CampaignSummary;

type Filters = {
    search: string;
};

type CampaignConfigurationProps = {
    d2: any;
    db: any;
    api: D2Api;
    compositionRoot: CompositionRoot;
    config: MetadataConfig;
    snackbar: any;
    loading: any;
    pageVisited: boolean;
    history: any;
};

type CampaignConfigurationState = {
    rows: DataSetRow[];
    pagination: TablePagination;
    sorting: TableSorting<DataSetRow>;
    dataSetsToDelete: DataSetRow[] | null;
    targetPopulationDataSet: any;
    objectsTableKey: any;
    filters: any;
};

class CampaignConfiguration extends React.Component<
    CampaignConfigurationProps,
    CampaignConfigurationState
> {
    static propTypes = {
        d2: PropTypes.object.isRequired,
        db: PropTypes.object.isRequired,
        config: PropTypes.object.isRequired,
        snackbar: PropTypes.object.isRequired,
        loading: PropTypes.object.isRequired,
        pageVisited: PropTypes.bool,
    };

    constructor(props: CampaignConfigurationProps) {
        super(props);

        this.state = {
            dataSetsToDelete: null,
            targetPopulationDataSet: null,
            objectsTableKey: new Date(),
            filters: {},
            rows: [],
            pagination: { ...initialPagination, total: 0 },
            sorting: this.initialSorting,
        };
    }

    hasCurrentUserRoles(userRoleNames: any) {
        return hasCurrentUserRoles(this.props.d2, this.props.config.userRoles, userRoleNames);
    }

    roles = this.props.config.userRoleNames;
    isCurrentUserManager = this.hasCurrentUserRoles(this.roles.manager);
    canCurrentUserSetTargetPopulation = this.hasCurrentUserRoles(this.roles.targetPopulation);

    columns: TableColumn<DataSetRow>[] = [
        { name: "displayName", text: i18n.t("Name"), sortable: true },
        {
            name: "publicAccess",
            text: i18n.t("Public access"),
            sortable: true,
            getValue: row => getValueForAccess(row.publicAccess),
        },
        { name: "lastUpdated", text: i18n.t("Last updated"), sortable: true },
    ];

    initialSorting = { field: "displayName" as "displayName", order: "asc" as "asc" };

    detailsFields = [
        { name: "displayName" as const, text: i18n.t("Name") },
        { name: "displayDescription" as const, text: i18n.t("Description") },
        { name: "created" as const, text: i18n.t("Created") },
        { name: "lastUpdated" as const, text: i18n.t("Last update") },
        { name: "id" as const, text: i18n.t("Id") },
        { name: "href" as const, text: i18n.t("API link") },
        // startDate/endDate are virtual fields not in DataSetRow, assert to the expected types
        {
            name: "startDate" as const,
            text: i18n.t("Start Date"),
            getValue: (dataSet: DataSetRow) => this.getDateValue("startDate", dataSet),
        } as unknown as ObjectsTableDetailField<DataSetRow>,
        {
            name: "endDate" as const,
            text: i18n.t("End Date"),
            getValue: (dataSet: DataSetRow) => this.getDateValue("endDate", dataSet),
        } as unknown as ObjectsTableDetailField<DataSetRow>,
    ];

    _actions: TableAction<DataSetRow>[] = [
        {
            name: "details",
            text: i18n.t("Details"),
            multiple: false,
            primary: true,
            icon: <Details />,
        },
        {
            name: "edit",
            text: i18n.t("Edit"),
            multiple: false,
            icon: <Edit />,
            isActive: () => this.isCurrentUserManager,
            onClick: ids => this.props.history.push(`/campaign-configuration/edit/${getId(ids)}`),
        },
        {
            name: "delete",
            text: i18n.t("Delete"),
            multiple: true,
            icon: <Delete />,
            isActive: () => this.isCurrentUserManager,
            onClick: ids => this.openDeleteConfirmation(this.getDataSets(ids)),
        },
        {
            name: "data-entry",
            icon: <LibraryBooks />,
            text: i18n.t("Go to Data Entry"),
            multiple: false,
            onClick: ids => this.props.history.push(`/data-entry/${getId(ids)}`),
        },
        {
            name: "dashboard",
            text: i18n.t("Go to Dashboard"),
            multiple: false,
            icon: <Dashboard />,
            onClick: ids => this.props.history.push(`/dashboard/${getId(ids)}`),
        },
        {
            name: "target-population",
            text: i18n.t("Set Target Population"),
            icon: <People />,
            multiple: false,
            isActive: () => this.canCurrentUserSetTargetPopulation,
            onClick: ids => this.openTargetPopulation(this.getFirstSelectedDataSet(ids)),
        },
    ];

    getDataSets = (ids: string[]): DataSetRow[] => {
        return this.state.rows.filter(row => ids.includes(row.id));
    };

    getFirstSelectedDataSet = (ids: string[]): DataSetRow => {
        const firstId = ids[0];
        const row = this.state.rows.find(row => row.id === firstId);
        if (!row) {
            throw new Error("No dataset found for id " + firstId);
        }
        return row;
    };

    actions = _(this._actions)
        .keyBy("name")
        .at(["target-population", "data-entry", "dashboard", "details", "edit", "delete"])
        .compact()
        .value();

    openTargetPopulation = (dataSet: DataSetRow) => {
        this.setState({ targetPopulationDataSet: dataSet });
    };

    closeTargetPopulation = () => {
        this.setState({ targetPopulationDataSet: null });
    };

    openDeleteConfirmation = (dataSets: any) => {
        this.setState({ dataSetsToDelete: dataSets });
    };

    closeDeleteConfirmation = () => {
        this.setState({ dataSetsToDelete: null });
    };

    reloadList = () => {
        this.list(this.state.filters, this.state.pagination, this.state.sorting);
        this.setState({ objectsTableKey: new Date() });
    };

    delete = async () => {
        const { compositionRoot, snackbar, loading } = this.props;
        const { dataSetsToDelete } = this.state;

        if (!dataSetsToDelete) return;

        loading.show(true, i18n.t("Deleting campaign(s). This may take a while, please wait"), {
            count: dataSetsToDelete.length,
        });
        this.closeDeleteConfirmation();
        const campaignIds = dataSetsToDelete.map(ds => ds.id);
        const response = await compositionRoot.campaigns.delete.execute(campaignIds);
        loading.hide();

        if (response.status) {
            snackbar.success(i18n.t("Campaign(s) deleted"));
            this.reloadList();
        } else {
            const { level, message } = response.error;

            if (level === "warning") {
                snackbar.warning(message);
                this.reloadList();
            } else {
                snackbar.error(`${i18n.t("Error deleting campaign(s)")}:\n${message}`);
            }
        }
    };

    getDateValue = (dateType: "startDate" | "endDate", dataSet: DataSetRow) => {
        switch (dateType) {
            case "startDate":
                return formatDateShort(dataSet.period?.start);
            case "endDate":
                return formatDateShort(dataSet.period?.end);
            default:
                console.error(`Date type not supported: ${dateType}`);
                return undefined;
        }
    };

    onCreate = () => {
        this.props.history.push("/campaign-configuration/new");
    };

    async componentDidMount() {
        await this.list(this.state.filters, this.state.pagination, this.state.sorting);
    }

    list = async (
        filters: Filters,
        pagination: TablePagination,
        sorting: TableSorting<DataSetRow>
    ) => {
        const res = await this.props.compositionRoot.campaigns.list.execute({
            filters: filters,
            pagination: {
                ...pagination,
                sorting: [sorting.field, sorting.order],
            },
        });

        this.setState({
            rows: res.objects,
            pagination: { ...res.pager, pageSize: pagination.pageSize },
            sorting: sorting,
            filters: filters,
        });
    };

    setTextSearch = async (search: string) => {
        const filters = { ...this.state.filters, search: search };
        this.list(filters, { ...this.state.pagination, page: 1 }, this.state.sorting);
    };

    listFromChange = async (state: TableState<DataSetRow>) => {
        this.list(this.state.filters, state.pagination, state.sorting);
    };

    backHome = () => {
        this.props.history.push("/");
    };

    renderDeleteConfirmationDialog = ({
        dataSets,
    }: {
        dataSets: Array<{ displayName: string }>;
    }) => {
        const description =
            i18n.t(
                "Are you sure you want to delete those campaign(s) (datasets and dashboards)? If you proceed, the associated datasets and dashboards will be removed from this server, but any data already registered will continue in the system"
            ) +
            "\n\n" +
            dataSets.map(ds => ds.displayName).join("\n");

        return (
            <ConfirmationDialog
                isOpen={!!dataSets}
                onSave={this.delete}
                onCancel={this.closeDeleteConfirmation}
                title={i18n.t("Delete campaign(s)")}
                description={description}
                saveText={i18n.t("Yes")}
            />
        );
    };

    render() {
        const { db, config, pageVisited } = this.props;
        const { dataSetsToDelete, targetPopulationDataSet, objectsTableKey } = this.state;
        const DeleteConfirmationDialog = this.renderDeleteConfirmationDialog;
        const help = i18n.t(
            `Click the blue button to create a new campaign or select a previously created campaign that you may want to access.
Click the three dots on the right side of the screen if you wish to perform any of the following actions -> Set Target Population, Go to Data Entry, Go To Dashboards, See Details, Edit or Delete.`
        );

        return (
            <React.Fragment>
                <PageHeader
                    title={i18n.t("Campaigns")}
                    help={help}
                    onBackClick={this.backHome}
                    pageVisited={pageVisited}
                />

                <ObjectsTable<DataSetRow>
                    details={this.detailsFields}
                    key={objectsTableKey}
                    columns={this.columns}
                    paginationOptions={{ pageSizeInitialValue: initialPagination.pageSize }}
                    initialState={{
                        pagination: this.state.pagination,
                        sorting: this.state.sorting,
                    }}
                    rows={this.state.rows}
                    actions={this.actions}
                    onChange={this.listFromChange}
                    pagination={this.state.pagination}
                    sorting={this.state.sorting}
                    onChangeSearch={this.setTextSearch}
                    filterComponents={
                        this.isCurrentUserManager ? (
                            <div>
                                <Button
                                    variant="contained"
                                    onClick={this.onCreate}
                                    style={styles.button}
                                >
                                    {i18n.t("Create Campaign")}
                                </Button>
                            </div>
                        ) : null
                    }
                />

                {dataSetsToDelete && <DeleteConfirmationDialog dataSets={dataSetsToDelete} />}
                {targetPopulationDataSet && (
                    <TargetPopulationDialog
                        db={db}
                        compositionRoot={this.props.compositionRoot}
                        config={config}
                        dataSet={targetPopulationDataSet}
                        onClose={this.closeTargetPopulation}
                    />
                )}
            </React.Fragment>
        );
    }
}

function getId(ids: string[]): string {
    const id = ids[0];
    if (!id) {
        throw new Error("No id found");
    }
    return id;
}

const initialPagination = { pageSize: 25, page: 1 };

const styles = {
    button: {
        position: "absolute" as "absolute",
        top: 0,
        right: 400,
    },
};

const textByAccess: Record<string, string> = {
    rw: i18n.t("R/W"),
    "r-": i18n.t("Read"),
    "--": i18n.t("Private"),
};

function getValueForAccess(value: string): string {
    const metadataAccess = value.slice(0, 2);
    const dataAccess = value.slice(2, 4);

    return [
        `${i18n.t("Metadata")}: ${textByAccess[metadataAccess]}`,
        " - ",
        `${i18n.t("Data")}: ${textByAccess[dataAccess]}`,
    ].join("");
}

export default withLoading(withSnackbar(withPageVisited(CampaignConfiguration as any, "config")));
