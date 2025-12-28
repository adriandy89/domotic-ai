/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatTimeDayJs } from "@/lib/convert";
import { Row } from "@tanstack/react-table";
import { IDeviceHomeTable } from "./schema.interface";

export const renderSubComponent = ({ row }: { row: Row<IDeviceHomeTable> }) => {
  const device = row.original;

  return (
    <Card className="p-2 m-2 shadow-lg">
      <CardHeader>
        <CardTitle>{device.name}</CardTitle>
        <CardDescription>ID: {device.uniqueId}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <strong>Model:</strong> {device.model}
          </div>
          <div>
            <strong>Category:</strong> {device.category}
          </div>
          <div>
            <strong>Disabled:</strong> {device.disabled ? "Yes" : "No"}
          </div>
          <div>
            <strong>Description:</strong> {device.description}
          </div>
          <div>
            <strong>Home ID:</strong> {device.home?.uniqueId ?? "N/A"}
          </div>
          <div>
            <strong>Home Name:</strong> {device.home?.name ?? "N/A"}
          </div>
          <div>
            <strong>Created At:</strong>{" "}
            {formatTimeDayJs(device.createdAt, "minutes", false)}
          </div>
          <div>
            <strong>Updated At:</strong>{" "}
            {device.updatedAt
              ? formatTimeDayJs(device.updatedAt, "minutes", false)
              : "N/A"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
