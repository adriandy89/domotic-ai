/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatTimeDayJs } from "@/lib/convert";
import { MqttConfig } from "@/state/user.state";
import { Row } from "@tanstack/react-table";

export const renderSubComponent = ({
  row,
  mqttConfig,
}: {
  row: Row<any>;
  mqttConfig?: MqttConfig;
}) => {
  const home = row.original;
  return (
    <Card className="p-1 m-1 mb-2 shadow-lg">
      <CardHeader>
        <CardTitle>{home.name}</CardTitle>
        <CardDescription>ID: {home.uniqueId}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <strong>Description:</strong> {home.description}
          </div>
          <div>
            <strong>Disabled:</strong> {home.disabled ? "Yes" : "No"}
          </div>
          <div>
            <strong>Created At:</strong>{" "}
            {formatTimeDayJs(home.createdAt, "minutes", false)}
          </div>
          <div>
            <strong>Updated At:</strong>{" "}
            {formatTimeDayJs(home.updatedAt, "minutes", false)}
          </div>
          <div>
            <strong>Last Home Report:</strong>{" "}
            {formatTimeDayJs(home.lastUpdate, "minutes", false) || "N/A"}
          </div>
          <div className="col-span-3 pt-1 border-t">
            <span className="font-semibold text-lg">
              Zegbee2Mqtt Config MQTT:
            </span>
          </div>
          <div>
            <strong>Host:</strong> {mqttConfig?.mqttHost}:{mqttConfig?.mqttPort}
          </div>
          <div>
            <strong>User:</strong> {home?.mqttUsername}
          </div>
          <div>
            <strong>Password:</strong> {home?.mqttPassword}
          </div>
          <div>
            <strong>Client ID:</strong> {home?.mqttUsername}
          </div>
          <div className="col-span-2">
            <strong>Base Topic:</strong> home/id/{home?.mqttUsername}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
