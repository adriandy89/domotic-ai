/* eslint-disable react-hooks/exhaustive-deps */
import {
  ActionBtnProps,
  DataTable,
} from "../../data-table/components/data-table";
import { useCallback, useEffect, useState } from "react";
import { columns } from "./columns";
import { Meta } from "@/components/data-table/interfaces/meta.interface";
import { IDeviceHomeTable, ITableParams } from "./schema.interface";
import { ITableOptions } from "@/components/data-table/interfaces/options.interface";
import api from "@/api";
import { PaginatedResponse } from "@/components/data-table/interfaces/paginated-response.interface";
import { renderSubComponent } from "./render-sub-component";
import { AddDeviceModal } from "./AddDeviceModal";
import { useRefreshStore } from "@/state/refresh.state";
import { DeleteAlertDialog } from "@/components/delete-alert-dialog";
import { FormError } from "@/components/form-error";

const initDevicesOptions: ITableOptions = {
  enableFilters: true,
  addButton: {
    disabled: false,
  },
  disableButton: {
    disabled: false,
  },
  enableButton: {
    disabled: false,
  },
  deleteButton: {
    disabled: false,
  },
};

export const DevicesHomeTable: React.FC = () => {
  const { refreshDevices } = useRefreshStore();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [devices, setDevices] = useState<IDeviceHomeTable[]>([]);
  const [selectedDevicesIds, setSelectedDevicesIds] = useState<number[]>([]);
  const [meta, setMeta] = useState<Meta>({
    hasNextPage: false,
    hasPreviousPage: false,
    itemCount: 0,
    orderBy: "",
    page: 1,
    pageCount: 0,
    sortOrder: "",
    take: 15,
  });

  const [devicesOptions] = useState<ITableOptions>(initDevicesOptions);

  const getData = useCallback(
    async ({ pageIndex, pageSize, sorting, filter }: ITableParams) => {
      setLoading(true);
      setError(false);
      setErrorMsg("");
      let route = `/api/v1/device-home/list?page=${(pageIndex ?? 0) + 1}&take=${
        pageSize ?? meta.take
      }`;
      if (filter) route += `&search=${filter}`;
      if (sorting?.length && sorting[0]?.id)
        route += `&orderBy=${sorting[0].id}&sortOrder=${
          sorting[0].desc ? "desc" : "asc"
        }`;
      const timestamp = new Date().getTime();
      route += `&=${timestamp}`;
      const response = await api
        .get<PaginatedResponse<IDeviceHomeTable>>(route)
        .catch((err) => {
          setLoading(false);
          setError(true);
          return Promise.reject(err);
        });
      setLoading(false);
      if (response.data) {
        const { meta, data } = response.data;
        setMeta(meta);
        setDevices(data);
      }
    },
    []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      getData({});
    }, 61000);
    return () => clearInterval(interval);
  }, [getData]);

  const deleteDevices = useCallback(async () => {
    setLoading(true);
    setError(false);
    setErrorMsg("");
    await api
      .delete("/api/v1/device-home/delete/many", {
        data: { devicesIds: selectedDevicesIds },
      })
      .then(() => {
        return getData({});
      })
      .catch((err) => {
        alert("Error deleting devices");
        return Promise.reject(err);
      })
      .finally(() => {
        setLoading(false);
        setShowDeleteModal(false);
      });
  }, [getData, selectedDevicesIds]);

  const handleToggleDevicesStatus = useCallback(
    async ({
      status,
      selectedIds,
    }: {
      status: boolean;
      selectedIds: number[];
    }) => {
      setLoading(true);
      setErrorMsg("");
      const url = status
        ? "/api/v1/device-home/enable/many"
        : "/api/v1/device-home/disable/many";
      await api
        .put(url, {
          devicesIds: selectedIds,
        })
        .then(({ data }) => {
          if (data?.error) {
            setErrorMsg(data.error);
            return;
          }
          return getData({});
        })
        .catch((err) => {
          alert("Error updating devices status");
          return Promise.reject(err);
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [getData]
  );

  const handleSelectedAction = useCallback(
    ({ action, selectedIds }: ActionBtnProps) => {
      console.log("Selected Action:", action);
      console.log("Selected Ids:", selectedIds);
      switch (action) {
        case "add":
          setShowAddModal(true);
          break;
        case "disable":
        case "enable":
          if (selectedIds && selectedIds.length > 0) {
            handleToggleDevicesStatus({
              status: action === "enable",
              selectedIds,
            });
          }
          break;
        case "delete":
          if (selectedIds && selectedIds.length > 0) {
            setSelectedDevicesIds(selectedIds);
            setShowDeleteModal(true);
          }
          break;

        default:
          break;
      }
    },
    []
  );

  const handleCloseAdd = () => {
    setShowAddModal(false);
    getData({});
  };

  useEffect(() => {
    if (isInitialLoad) {
      setIsInitialLoad(false);
      return;
    }
    getData({});
  }, [refreshDevices]);

  return (
    <>
      <div className="h-full flex-1 flex-col p-1 md:flex">
        <DataTable
          options={devicesOptions}
          data={devices}
          columns={columns}
          meta={meta}
          error={error}
          loading={loading}
          initialColumnVisibility={{
            createdAt: false,
          }}
          loadData={getData}
          actionBtn={({ action, selectedIds }) =>
            handleSelectedAction({ action, selectedIds })
          }
          getRowCanExpand={() => true}
          renderSubComponent={renderSubComponent}
        />
        <FormError message={errorMsg} />
      </div>
      {showAddModal && (
        <>
          <AddDeviceModal
            showAddModal={showAddModal}
            handleClose={handleCloseAdd}
          />
        </>
      )}
      {showDeleteModal && (
        <DeleteAlertDialog
          open={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={deleteDevices}
          loading={loading}
          title="Are you absolutely sure?"
          description="This action cannot be undone. This will permanently delete your selected devices and remove your data from our servers."
          showConfirmText
        />
      )}
    </>
  );
};
