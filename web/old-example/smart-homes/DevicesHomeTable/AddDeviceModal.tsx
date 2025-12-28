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
import { useRefreshStore } from "@/state/refresh.state";
import { zodResolver } from "@hookform/resolvers/zod";
import { DialogDescription } from "@radix-ui/react-dialog";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { IHomeTable } from "../HomesTable/schema.interface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  showAddModal: boolean;
  handleClose: () => void;
  selectedDevice?: any;
}

const formSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(124, "Name must be at most 64 characters."),
  uniqueId: z
    .string()
    .min(2, "Unique ID must be at least 2 characters.")
    .max(124, "Unique ID must be at most 64 characters."),
  model: z
    .string()
    .max(124, "Model must be at most 124 characters.")
    .optional(),
  category: z
    .string()
    .max(124, "Category must be at most 124 characters.")
    .optional(),
  description: z
    .string()
    .max(124, "Category must be at most 124 characters.")
    .optional(),
  homeId: z.string().optional(),
  disabled: z.boolean().optional(),
});

export const AddDeviceModal: React.FC<Props> = ({
  showAddModal,
  handleClose,
  selectedDevice,
}) => {
  const [selectHomes, setSelectHomes] = useState<IHomeTable[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { toggleRefreshDevices } = useRefreshStore();
  // 1. Define your form.
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: selectedDevice?.name ?? "",
      uniqueId: selectedDevice?.uniqueId ?? "",
      model: selectedDevice?.model ?? "",
      category: selectedDevice?.category ?? "",
      description: selectedDevice?.description ?? "",
      homeId: selectedDevice?.homeId ? `${selectedDevice?.homeId}` : " ",
      disabled: selectedDevice?.disabled ?? false,
    },
  });

  useEffect(() => {
    const getHomesSelect = async () => {
      await api
        .get(`/api/v1/home/list/all-select`)
        .then(({ data }) => {
          if (data.homes) setSelectHomes(data.homes);
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg("Error getting homes.");
        });
    };
    getHomesSelect();
  }, []);

  // 2. Define a submit handler.
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setErrorMsg(null);
    const { homeId, ...data } = { ...values };
    const home = homeId === " " ? null : +homeId!;
    const formData = {
      ...data,
      homeId: home,
    };
    if (selectedDevice) {
      // Edit device
      await api
        .put(`/api/v1/device-home/${selectedDevice.id}`, formData)
        .then(({ data }) => {
          if (data.error) setErrorMsg(data.error);
          else handleClose();
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg("Error updating device.");
        })
        .finally(() => {
          toggleRefreshDevices();
          setLoading(false);
        });
      return;
    } else {
      // Add device
      await api
        .post("/api/v1/device-home", formData)
        .then(({ data }) => {
          if (data.error) setErrorMsg(data.error);
          else handleClose();
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg("Error adding device.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }

  return (
    <Dialog open={showAddModal} onOpenChange={handleClose}>
      <DialogContent
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        className="max-h-[100vh] w-full md:w-auto md:min-w-[540px] max-w-[100vw] flex flex-col overflow-hidden p-4 m-0"
        aria-describedby={"add-device"}
      >
        <ScrollArea className="h-screen md:h-auto">
          <DialogHeader className="py-2">
            <DialogTitle className="text-center pb-4">
              {selectedDevice ? "Edit Device" : "Add Device"}
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
                      name="uniqueId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unique ID</FormLabel>
                          <FormControl>
                            <Input placeholder="490154203237518" {...field} />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <FormControl>
                            <Input placeholder="model" {...field} />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl>
                            <Input placeholder="category" {...field} />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl>
                            <Input placeholder="description" {...field} />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="homeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Home</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={`${field.value}`}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Link a Home" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem
                                key={`home-0`}
                                value={" "}
                                className="text-sm min-h-7"
                              >
                                {" "}
                              </SelectItem>
                              {selectHomes.map((home) => (
                                <SelectItem
                                  key={`home-${home.id}`}
                                  value={`${home.id}`}
                                  className="text-sm"
                                >
                                  {home.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="disabled"
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
                                <FormLabel>Disable device</FormLabel>
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
                      {selectedDevice ? "Save" : "Add"}
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
