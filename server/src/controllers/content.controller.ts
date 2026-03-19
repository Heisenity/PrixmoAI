//content generation request flow
import { Request, Response, NextFunction } from "express";

export const generateContent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user as any;

    if (!user?.id) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Content generated successfully",
      data: req.body,
    });
  } catch (error) {
    next(error);
  }
};

//content history flow
export const getContentHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user as any;

    if (!user?.id) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    /*const history = [
      {
        id: "1",
        topic: "Instagram marketing",
        platform: "instagram",
        createdAt: new Date(),
      },
    ];*/

    res.status(200).json({
      success: true,
      message: "Content history fetched successfully",
      data:[]// history,
    });
  } catch (error) {
    next(error);
  }
};

//delete content history flow
export const deleteContentHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user as any;

    if (!user?.id) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }
//simulate deletion logic here
    res.status(200).json({
      success: true,
      message: "Content history deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
