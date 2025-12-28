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
import { IUserHomeTable } from "./schema.interface";

export const renderSubComponent = ({ row }: { row: Row<any> }) => {
  const user: IUserHomeTable = row.original;
  return (
    <Card className="p-2 m-2 shadow-lg">
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
        <CardDescription>Email: {user.username}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <strong>Status:</strong> {user.isActive ? "Enable" : "Disable"}
          </div>
          <div>
            <strong>Role:</strong> {user.role}
          </div>
          <div>
            <strong>Phone:</strong> {user.phone || "N/A"}
          </div>
          <div>
            <strong>Created At:</strong>{" "}
            {formatTimeDayJs(user.createdAt, "minutes", false)}
          </div>
          <div>
            <strong>Updated At:</strong>{" "}
            {formatTimeDayJs(user.updatedAt, "minutes", false)}
          </div>
          <div>
            <strong>Expire Date:</strong>{" "}
            {user.expirationTime
              ? formatTimeDayJs(user.expirationTime, "minutes", false)
              : "N/A"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
