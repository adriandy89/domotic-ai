import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Subscription, useUserStore } from "@/state/user.state";
import { useCallback, useEffect, useState } from "react";
import { IStatisticsDevices, IStatisticsUsersTrack } from "@/interfaces";
import api from "@/api";
import { Skeleton } from "../ui/skeleton";

export const SmartHomesResume: React.FC = () => {
  const { user } = useUserStore();
  const [currentPlan, setCurrentPlan] = useState<Subscription | undefined>();
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [devices, setDevices] = useState<IStatisticsDevices | null>(null);
  const [users, setUsers] = useState<IStatisticsUsersTrack | null>(null);

  useEffect(() => {
    if (user) {
      const currentSubscription = user.organization.subscriptions.find(
        (sub) => sub.plan.planType === "home"
      );
      setCurrentPlan(currentSubscription);
    }
  }, [user]);

  const getDevicesStatistics = useCallback(async () => {
    setLoadingDevices(true);
    let route = `/api/v1/device-home/statistics/org-devices`;
    const timestamp = new Date().getTime();
    route += `?=${timestamp}`;
    const response = await api.get<IStatisticsDevices>(route).catch((err) => {
      setLoadingDevices(false);
      return Promise.reject(err);
    });
    setLoadingDevices(false);
    if (response.data) {
      setDevices(response.data);
    }
  }, []);

  const getUserStatistics = useCallback(async () => {
    setLoadingUsers(true);
    let route = `/api/v1/user-home/statistics/org-users`;
    const timestamp = new Date().getTime();
    route += `?=${timestamp}`;
    const response = await api
      .get<IStatisticsUsersTrack>(route)
      .catch((err) => {
        setLoadingUsers(false);
        return Promise.reject(err);
      });
    setLoadingUsers(false);
    if (response.data) {
      setUsers(response.data);
    }
  }, []);

  useEffect(() => {
    getDevicesStatistics();
    getUserStatistics();
  }, [getDevicesStatistics, getUserStatistics]);

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card className="drop-shadow-xl shadow-black/10 dark:shadow-white/10">
        <CardHeader className="p-2">
          <CardTitle className="text-2xl text-center pb-2 border-b-2">
            Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col space-y-3">
          <h3 className="capitalize">
            <span className="font-semibold">Current Plan:</span>{" "}
            {currentPlan
              ? `${currentPlan?.plan.planType} ${currentPlan?.plan.planDetail}`
              : "Free"}
          </h3>
          <h3 className="capitalize">
            <span className="font-semibold">Subscription Status:</span>{" "}
            {currentPlan ? currentPlan?.status : "Active"}
          </h3>
          <h3>
            <span className="font-semibold">Current Period End:</span>{" "}
            {currentPlan
              ? dayjs(currentPlan?.currentPeriodEnd).format("DD/MM/YYYY")
              : "N/A"}
          </h3>

          <h3>
            <span className="font-semibold">Max Devices: </span>{" "}
            {currentPlan?.plan.maxDevices || 1}
          </h3>

          <h3>
            <span className="font-semibold">Max Users: </span>{" "}
            {currentPlan?.plan.maxMembers || 1}
          </h3>

          <h3>
            <span className="font-semibold">Storage Time: </span>
            {" Last "}
            {currentPlan?.plan.maxStorageDays || 60} days
          </h3>
        </CardContent>
      </Card>
      <Card className="drop-shadow-xl shadow-black/10 dark:shadow-white/10">
        <CardHeader className="p-2">
          <CardTitle className="text-2xl text-center pb-2 border-b-2">
            Devices
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col space-y-3">
          <h3 className="capitalize flex items-center space-x-2">
            <span className="font-semibold">Total Devices:</span>{" "}
            {loadingDevices ? (
              <Skeleton className="h-4 w-[60px]" />
            ) : (
              <span>{devices?.totalDevices || 0}</span>
            )}
          </h3>
          <h3 className="capitalize flex items-center space-x-2">
            <span className="font-semibold">Enabled:</span>
            {loadingDevices ? (
              <Skeleton className="h-4 w-[60px]" />
            ) : (
              <span>{devices?.enabledDevices || 0}</span>
            )}
          </h3>
          <h3 className="capitalize flex items-center space-x-2">
            <span className="font-semibold">Disabled:</span>
            {loadingDevices ? (
              <Skeleton className="h-4 w-[60px]" />
            ) : (
              <span>{devices?.disabledDevices || 0}</span>
            )}
          </h3>
        </CardContent>
      </Card>
      <Card className="drop-shadow-xl shadow-black/10 dark:shadow-white/10">
        <CardHeader className="p-2">
          <CardTitle className="text-2xl text-center pb-2 border-b-2">
            Users
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col space-y-3">
          <h3 className="capitalize flex items-center space-x-2">
            <span className="font-semibold">Total Users:</span>{" "}
            {loadingUsers ? (
              <Skeleton className="h-4 w-[60px]" />
            ) : (
              <span>{users?.totalUsers || 0}</span>
            )}
          </h3>
          <h3 className="capitalize flex items-center space-x-2">
            <span className="font-semibold">Enabled:</span>
            {loadingUsers ? (
              <Skeleton className="h-4 w-[60px]" />
            ) : (
              <span>{users?.enabledUsers || 0}</span>
            )}
          </h3>
          <h3 className="capitalize flex items-center space-x-2">
            <span className="font-semibold">Disabled:</span>
            {loadingUsers ? (
              <Skeleton className="h-4 w-[60px]" />
            ) : (
              <span>{users?.disabledUsers || 0}</span>
            )}
          </h3>
        </CardContent>
      </Card>
    </div>
  );
};
