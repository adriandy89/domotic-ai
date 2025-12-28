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
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { IHomeTable } from "./schema.interface";
import { useUserStore } from "@/state/user.state";
interface Props {
  showAddModal: boolean;
  handleClose: () => void;
  selectedHome?: any;
}

const formSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(124, "Name must be at most 64 characters."),
  description: z
    .string()
    .max(124, "Description must be at most 124 characters.")
    .optional(),
  disabled: z.boolean().optional(),
});

export const AddHomeModal: React.FC<Props> = ({
  showAddModal,
  handleClose,
  selectedHome,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { mqttConfig } = useUserStore();
  const [showMqttConfig, setShowMqttConfig] = useState<boolean>(false);
  const [data, setData] = useState<IHomeTable | null>(null);
  const { toggleRefreshHomes } = useRefreshStore();
  // 1. Define your form.
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: selectedHome?.name ?? "",
      description: selectedHome?.description ?? "",
      disabled: selectedHome?.disabled ?? false,
    },
  });

  const handleCreated = (resp: { ok: boolean; data?: IHomeTable }) => {
    if (resp?.data) {
      setData(resp.data);
      setShowMqttConfig(true);
    }
  };

  const handleCloseCreated = () => {
    setShowMqttConfig(false);
    handleClose();
  };

  // 2. Define a submit handler.
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setErrorMsg(null);
    if (selectedHome) {
      // Edit home
      await api
        .put(`/api/v1/home/${selectedHome.id}`, values)
        .then(({ data }) => {
          if (data.error) setErrorMsg(data.error);
          else handleClose();
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg("Error updating home.");
        })
        .finally(() => {
          toggleRefreshHomes();
          setLoading(false);
        });
      return;
    } else {
      // Add home
      await api
        .post("/api/v1/home", values)
        .then(({ data }) => {
          if (data.error) setErrorMsg(data.error);
          else handleCreated(data);
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg("Error adding home.");
        })
        .finally(() => {
          setLoading(false);
          console.log("done");
        });
    }
  }

  return (
    <>
      <Dialog open={showAddModal} onOpenChange={handleClose}>
        <DialogContent
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          className="max-h-[100vh] w-full md:w-auto md:min-w-[540px] max-w-[100vw] flex flex-col overflow-hidden p-4 m-0"
          aria-describedby={"add-home"}
        >
          <ScrollArea className="h-screen md:h-auto">
            <DialogHeader className="py-2">
              <DialogTitle className="text-center pb-4">
                {selectedHome ? "Edit Home" : "Add Home"}
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
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Input placeholder="description" {...field} />
                            </FormControl>

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
                                  <FormLabel>Disable the home</FormLabel>
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
                        {selectedHome ? "Save" : "Add"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </DialogHeader>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <Dialog open={showMqttConfig} onOpenChange={handleCloseCreated}>
        <DialogContent
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-center font-semibold text-lg">
              Zegbee2Mqtt Config MQTT:
            </DialogTitle>
            <DialogDescription className="flex flex-col gap-2 pt-2 text-left">
              <span className="font-semibold text-sm">
                <strong>Host: </strong>
                {mqttConfig?.mqttHost}:{mqttConfig?.mqttPort}
              </span>
              <span className="font-semibold text-sm">
                <strong>Base Topic:</strong> home/id/{data?.mqttUsername}
              </span>
              <span className="font-semibold text-sm">
                <strong>Client ID:</strong> {data?.mqttUsername}
              </span>
              <span className="font-semibold text-sm">
                <strong>User:</strong> {data?.mqttUsername}
              </span>
              <span className="font-semibold text-sm">
                <strong>Password:</strong> {data?.mqttPassword}
              </span>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
};
