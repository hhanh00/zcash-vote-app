import { Button, Modal } from "flowbite-react"

type VoteSuccessProps = {
    hash: string;
    open: boolean;
    setOpen: (b: boolean) => void;
}

export const VoteSuccess: React.FC<VoteSuccessProps> = ({hash, open, setOpen}) => {
    return <Modal show={open}>
        <Modal.Body>
          <div className="text-center">
            <h3 className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
              Voting Successful
            </h3>
            <div className="mb-5 text-md">{hash}</div>
            <div className="flex justify-center gap-4">
              <Button onClick={() => setOpen(false)}>
                OK
              </Button>
            </div>
          </div>
        </Modal.Body>
    </Modal>
}
