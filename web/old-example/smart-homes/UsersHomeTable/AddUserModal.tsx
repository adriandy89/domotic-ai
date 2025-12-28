/* eslint-disable @typescript-eslint/no-explicit-any */
import api from "@/api";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRefreshStore } from "@/state/refresh.state";
import { zodResolver } from "@hookform/resolvers/zod";
import { DialogDescription } from "@radix-ui/react-dialog";
import { LoaderCircleIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { RoleHome } from "./role-home.enum";
import { IUserHomeTable } from "./schema.interface";
import { Label } from "@/components/ui/label";
import MultipleSelector, { Option } from "@/components/ui/multiple-selector";
import { NOTIFICATION_OPTIONS } from "@/lib/notification-options";

interface Props {
  showAddModal: boolean;
  handleClose: () => void;
  selectedUser?: IUserHomeTable;
}

const getFormSchema = (selectedUser?: any) => {
  return z.object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters.")
      .max(64, "Name must be at most 64 characters."),
    username: z
      .string()
      .email("Must be a valid email.")
      .max(128, "Email must be at most 128 characters."),
    phone: z.string().optional(),
    password: selectedUser
      ? z.string().optional()
      : z
          .string()
          .min(8, "Password must be at least 8 characters.")
          .max(32, "Password must be at most 32 characters.")
          .regex(
            /(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/,
            "Must include at least one uppercase character, one lowercase character, one number, and one special character."
          ),
    isActive: z.boolean().optional(),
    role: z.string(),
    expirationTime: z.date().optional(),
  });
};

export const AddUserModal: React.FC<Props> = ({
  showAddModal,
  handleClose,
  selectedUser,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { toggleRefreshUsers } = useRefreshStore();
  const [roles] = useState<RoleHome[]>([
    RoleHome.GUEST,
    RoleHome.USER,
    RoleHome.MANAGER,
    RoleHome.ADMIN,
  ]);
  const [channels, setChannels] = useState<string[]>(
    selectedUser?.channels ?? []
  );
  const formSchema = useMemo(() => getFormSchema(selectedUser), [selectedUser]);

  // 1. Define your form.
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: selectedUser?.name ?? "",
      username: selectedUser?.username ?? "",
      phone: selectedUser?.phone ?? "",
      password: undefined,
      isActive: selectedUser?.isActive ?? true,
      role: selectedUser?.role ?? RoleHome.USER,
      expirationTime: selectedUser?.expirationTime
        ? new Date(selectedUser.expirationTime)
        : undefined,
    },
  });

  // 2. Define a submit handler.
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setErrorMsg(null);
    if (selectedUser) {
      // Edit User
      await api
        .put(`/api/v1/user-home/${selectedUser.id}`, { ...values, channels })
        .then(({ data }) => {
          if (data.error) setErrorMsg(data.error);
          else handleClose();
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg("Error updating User.");
        })
        .finally(() => {
          toggleRefreshUsers();
          setLoading(false);
        });
      return;
    } else {
      // Add User
      await api
        .post("/api/v1/user-home", { ...values, channels })
        .then(({ data }) => {
          if (data.error) setErrorMsg(data.error);
          else handleClose();
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg("Error adding User.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }

  const handleNotificationChange = (selectedOptions: Option[]) => {
    const updatedChannels = selectedOptions.map((option) => option.value);
    setChannels(updatedChannels ?? []);
  };

  return (
    <Dialog open={showAddModal} onOpenChange={handleClose}>
      <DialogContent
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        className="max-h-[100vh] w-full md:w-auto md:min-w-[580px] max-w-[100vw] flex flex-col overflow-hidden p-4 m-0"
        aria-describedby={"add-User"}
      >
        <ScrollArea className="h-screen md:h-auto">
          <DialogHeader className="py-2">
            <DialogTitle className="text-center pb-4">
              {selectedUser ? "Edit User" : "Add User"}
            </DialogTitle>
            <DialogDescription />
            <div className="flex flex-col space-y-2 pl-2 pr-3">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-8"
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="name" {...field} />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="email@ex.c"
                              {...field}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="password"
                              {...field}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={`${field.value}`}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a Role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {roles.map((role) => (
                                <SelectItem
                                  key={`role-i${role}`}
                                  value={`${role}`}
                                  className="text-sm"
                                >
                                  {role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* <FormField
                      control={form.control}
                      name="expirationTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiration Date</FormLabel>
                          <>
                            <style>
                              {`
                                .date-part {
                                touch-action: none;
                                }
                            `}
                            </style>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? (
                                      dayjs(field.value).format("DD-MM-YYYY")
                                    ) : (
                                      <span>Optional</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="start"
                                side="top"
                              >
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  disabled={(date) =>
                                    date < new Date() ||
                                    date > new Date("3000-01-01")
                                  }
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </>
                          <FormMessage />
                        </FormItem>
                      )}
                    /> */}

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notification Phone (with code)</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="Ex.: 34692100100"
                              {...field}
                              onInput={(e: any) => {
                                e.target.value = e.target.value.replace(
                                  /\D/g,
                                  ""
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-2">
                      <Label>Notification Channels</Label>
                      <MultipleSelector
                        options={NOTIFICATION_OPTIONS}
                        value={channels.map((channel) => ({
                          label:
                            NOTIFICATION_OPTIONS.find(
                              (option) => option.value === channel
                            )?.label || channel,
                          value: channel,
                        }))}
                        onChange={handleNotificationChange}
                        hidePlaceholderWhenSelected
                        placeholder="Optional notification channels ..."
                        emptyIndicator={
                          <p className="text-center text-lg leading-10 text-gray-600 dark:text-gray-400">
                            Empty.
                          </p>
                        }
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-col justify-end">
                          <FormLabel> </FormLabel>
                          <FormControl>
                            <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-2 shadow">
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                              <div className="space-y-1 leading-none">
                                <FormLabel>Enable User</FormLabel>
                              </div>
                            </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex flex-col justify-center gap-2">
                    {errorMsg && <FormError message={errorMsg} />}
                    <Button
                      type="submit"
                      className="text-center min-w-36 text-white"
                      disabled={loading}
                    >
                      {loading && (
                        <LoaderCircleIcon className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      {selectedUser ? "Save" : "Add"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </DialogHeader>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
