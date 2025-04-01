import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const FormSchema = z.object({
  urls: z.string().min(1, "URL is required").refine(validateURLs, {
    message:
      "URLS must be a comma separated list of valid URLs",
  }),
  key: z.string().min(1, "Key is required").refine(validateKey, {
    message:
      "Key must be either a 24 seed phrase or a unified viewing key with an Orchard receiver",
  }),
  internal: z.boolean().default(false),
});

export function Election() {
  const navigate = useNavigate();
  const [openModal, setOpenModal] = useState(false);
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      urls: "",
      key: "",
    },
  });

  const onCloseModal: SubmitHandler<z.infer<typeof FormSchema>> = async (
    data
  ) => {
    console.log(data);

    setOpenModal(false);
    if (data.urls == "") return;

    const urls = data.urls.split(",");
    const randomIndex = Math.floor(Math.random() * urls.length);
    const url = urls[randomIndex];
    const rep: string = await invoke("http_get", { url: url });
    console.log(rep);
    const election: Election = JSON.parse(rep);

    console.log(election);
    await invoke("set_election", {
      urls: data.urls,
      election: election,
      key: data.key,
      internal: data.internal,
    });
    const name = election.name;

    (async () => {
      const dbFilename = await save({
        defaultPath: name,
        title: "Save Election File",
        filters: [
          {
            name: "Election db",
            extensions: ["db"],
          },
        ],
      });
      if (dbFilename != null) {
        await invoke("save_db", { path: dbFilename });
        navigate("/overview");
      }
    })();
  };

  const openDb = async () => {
    const dbFilename = await open();
    if (dbFilename != null) {
      await invoke("open_db", { path: dbFilename });
      navigate("/overview");
    }
  };

  return (
    <>
      <div className="flex flex-grow items-center justify-center">
        <div className="bg-white max-w-xl mx-auto rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-4 text-center">
            Welcome to the Zcash Voting App
          </h1>
          <p className="text-gray-600 text-center">
            Click on
            <Button
              onClick={() => setOpenModal(true)}
              className="inline-flex mx-2"
            >
              New
            </Button>
            to start voting on a new election, or
            <Button onClick={openDb} className="inline-flex mx-2">
              Open
            </Button>
            to continue with a previous election.
          </p>
        </div>

        <Dialog open={openModal} onOpenChange={(c) => setOpenModal(c)}>
          <DialogContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onCloseModal)}
                className="w-full space-y-6"
              >
                <h3 className="mb-4 text-lg font-medium">New Election</h3>
                <FormField
                  control={form.control}
                  name="urls"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <FormLabel>Election URL</FormLabel>
                      <FormControl>
                        <Input autoFocus type="url" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="key"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <FormLabel>Seed Phrase</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="internal"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <FormLabel>Zashi Internal Wallet</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="w-full gap-8">
                  <Button type="submit">Save Election</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

async function validateURLs(urlsDelimited: string) {
  try {
    const urls = urlsDelimited.split(",");
    for (const url of urls) {
      await invoke("http_get", { url: url });
    }
  } catch {
    return false;
  }
  return true;
}

async function validateKey(key: string) {
  const isValid: boolean = await invoke("validate_key", { key: key });
  return isValid;
}
